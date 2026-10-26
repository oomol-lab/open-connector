import type { CredentialValidationResult } from "../../core/types.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { looseArray, optionalNumber, optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import {
  ProviderRequestError,
  isAbortLikeError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { tendataEndpoints } from "./actions.ts";

export const tendataApiBaseUrl = "https://open-api.tendata.cn/v2";
const tokenCache = new Map<string, Promise<AccessToken>>();

const tokenCacheMaxEntries = 500;

const rangeFields = ["weight", "quantity", "sumOfUSD", "weightUnitPriceUSD", "quantityUnitPriceUSD"];

const conflictingFields = [
  "productDesc",
  "hsCode",
  "importer",
  "exporter",
  "portOfDeparture",
  "portOfArrival",
  "transportType",
  "quantityUnit",
  "searchMode",
  ...rangeFields,
];

interface AccessToken {
  accessToken: string;
  expiresAt: number;
}

export async function validateTendataCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const pending = fetchAccessToken(apiKey, fetcher);
  cacheToken(sha256Hex(apiKey), pending);
  await pending;
  return {
    profile: { displayName: "Tendata API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: tendataApiBaseUrl, validationEndpoint: "/access-token" },
  };
}

export async function executeTendataAction(
  actionName: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const endpoint = tendataEndpoints[actionName];
  const paginatedTrades = [
    "list_trades",
    "list_specific_trades",
    "list_importer_names",
    "list_exporter_names",
    "list_importers",
    "list_exporters",
    "analyze_origins",
    "analyze_destinations",
    "analyze_trade_trends",
    "analyze_hs_codes",
  ];
  const pageSize =
    actionName === "list_companies"
      ? 20
      : actionName === "list_contacts" || paginatedTrades.includes(actionName)
        ? 10
        : undefined;
  if (pageSize !== undefined) input = { ...input, pageNo: input.pageNo ?? 1, pageSize: input.pageSize ?? pageSize };
  if (actionName === "list_charge_records") input = { ...input, limit: input.limit ?? 100 };
  if (endpoint.trade) validateTradeInput(input);
  let path: string = endpoint.path;
  if (actionName === "get_contact_social_links") {
    const mailsouId = requiredInputString(input.mailsouId, "mailsouId");
    if (mailsouId === "." || mailsouId === "..")
      throw providerInputError("mailsouId is not a valid contact identifier");
    path = path.replace("{mailsouId}", encodeURIComponent(mailsouId));
  }
  const url = new URL(`${tendataApiBaseUrl}${path}`);
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === "mailsouId") continue;
    if (endpoint.method === "GET") url.searchParams.set(key, String(value));
    else body[key] = rangeFields.includes(key) && Array.isArray(value) ? value.map(String) : value;
  }
  const init: RequestInit = {
    signal,
    method: endpoint.method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: endpoint.method === "POST" ? JSON.stringify(body) : undefined,
  };
  let token = await getAccessToken(apiKey, fetcher);
  for (let attempt = 0; ; attempt += 1) {
    const { response, payload } = await fetchJsonWithToken(url, init, apiKey, token.accessToken, fetcher);
    if (attempt === 0 && isInvalidToken(payload)) {
      token = await getAccessToken(apiKey, fetcher, token.accessToken);
      continue;
    }
    assertSuccess(response, payload, [apiKey, token.accessToken]);
    return payload;
  }
}

async function fetchJsonWithToken(
  url: URL,
  init: RequestInit,
  apiKey: string,
  accessToken: string,
  fetcher: typeof fetch,
) {
  return runProviderRequest({ label: "Tendata", signal: init.signal ?? undefined }, async (signal) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    const response = await fetcher(url, { ...init, headers, signal });
    const payload = await readEnvelope(response);
    return { response, payload };
  }).catch((error: unknown) => {
    throw redactError(error, [apiKey, accessToken]);
  });
}

export async function getAccessToken(
  apiKey: string,
  fetcher: typeof fetch,
  rejectedToken?: string,
): Promise<AccessToken> {
  const key = sha256Hex(apiKey);
  const cached = tokenCache.get(key);
  if (cached) {
    const token = await cached;
    if (Date.now() < token.expiresAt && token.accessToken !== rejectedToken) return token;
    if (tokenCache.get(key) !== cached) return getAccessToken(apiKey, fetcher, rejectedToken);
    tokenCache.delete(key);
  }
  const pending = fetchAccessToken(apiKey, fetcher);
  cacheToken(key, pending);
  return pending;
}

function cacheToken(key: string, pending: Promise<AccessToken>) {
  tokenCache.set(key, pending);
  if (tokenCache.size > tokenCacheMaxEntries) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
  void pending.catch(() => {
    if (tokenCache.get(key) === pending) tokenCache.delete(key);
  });
}

async function fetchAccessToken(apiKey: string, fetcher: typeof fetch): Promise<AccessToken> {
  const url = new URL(`${tendataApiBaseUrl}/access-token`);
  url.searchParams.set("apiKey", apiKey);
  return runProviderRequest({ label: "Tendata authentication" }, async (signal) => {
    const startedAt = Date.now();
    const response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      redirect: "manual",
      signal,
    });
    const payload = await readEnvelope(response);
    assertSuccess(response, payload, [apiKey]);
    const data = requiredResponseRecord(payload.data, "Tendata access token data");
    const accessToken = optionalString(data.accessToken);
    if (!accessToken) throw providerResponseError("Tendata response is missing its access token");
    const expiresIn = optionalNumber(data.expiresIn);
    if (expiresIn === undefined) throw providerResponseError("Tendata response is missing token expiry");
    if (data.unit !== "SECONDS" || data.tokenType !== "Bearer" || expiresIn <= 0) {
      throw providerResponseError("Tendata returned unsupported access token metadata");
    }
    const lifetime = expiresIn * 1000;
    if (!Number.isFinite(lifetime)) {
      throw providerResponseError("Tendata returned invalid token lifetime");
    }
    return { accessToken, expiresAt: startedAt + lifetime - Math.min(30000, lifetime / 10) };
  }).catch((error: unknown) => {
    throw redactError(error, [apiKey]);
  });
}

async function readEnvelope(response: Response) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      "Tendata response is not valid JSON",
      undefined,
      "provider_error",
    );
  }
  return requiredResponseRecord(payload, "Tendata response");
}

export function isInvalidToken(payload: unknown): boolean {
  const envelope = optionalRecord(payload);
  return envelope?.success === false && String(envelope.code) === "40302";
}

function assertSuccess(response: Response, payload: Record<string, unknown>, secrets: string[]) {
  if (response.ok && payload.success === true) return;
  const code = optionalString(payload.code) ?? optionalNumber(payload.code)?.toString();
  const traceId = optionalString(payload.traceId);
  const message = optionalString(payload.msg) ?? "Tendata request failed";
  const errorCode = code === "40101" || code === "40102" ? "rate_limited" : "provider_error";
  throw new ProviderRequestError(
    errorCode === "rate_limited" ? 429 : response.ok ? 502 : response.status,
    redactText(message, secrets),
    {
      code: code === undefined ? undefined : redactText(code, secrets),
      traceId: traceId === undefined ? undefined : redactText(traceId, secrets),
    },
    errorCode,
  );
}

function redactText(text: string, secrets: string[]) {
  let result = text;
  for (const secret of secrets) {
    if (!secret) continue;
    for (const encoded of new Set([
      secret,
      encodeURIComponent(secret),
      new URLSearchParams({ value: secret }).toString().slice(6),
    ])) {
      result = result.replaceAll(encoded, "[REDACTED]");
    }
  }
  return result;
}

export function redactError(error: unknown, secrets: string[]): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return new ProviderRequestError(error.status, redactText(error.message, secrets), error.details, error.code);
  }
  return providerResponseError("Tendata request failed");
}

function validateTradeInput(input: Record<string, unknown>) {
  const pageNo = optionalNumber(input.pageNo);
  const pageSize = optionalNumber(input.pageSize);
  if (pageNo !== undefined && pageSize !== undefined && pageNo * pageSize > 10000) {
    throw providerInputError("pageNo × pageSize must not exceed 10000");
  }
  const startDate = requiredInputString(input.startDate, "startDate");
  const endDate = requiredInputString(input.endDate, "endDate");
  const difference = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
  const maxDays = input.catalog === "all" ? 365 : 1096;
  if (!Number.isFinite(difference) || difference < 0 || difference > maxDays) {
    throw providerInputError(`endDate - startDate must be between 0 and ${maxDays} days`);
  }
  const groups = looseArray(input.conditionGroups);
  if (
    groups.length === 0 &&
    !["hsCode", "productDesc", "importer", "exporter"].some((field) => optionalString(input[field])?.trim())
  ) {
    throw providerInputError("Trade queries require hsCode, productDesc, importer, exporter, or conditionGroups");
  }
  if (groups.length > 0) {
    const conflict = conflictingFields.find((field) => input[field] !== undefined);
    if (conflict) throw providerInputError(`${conflict} cannot be combined with conditionGroups`);
    let conditionCount = 0;
    for (const value of groups) {
      const group = recordOrEmpty(value);
      const conditions = looseArray(group.conditions);
      conditionCount += conditions.length;
      if (
        !conditions.some((condition) => {
          const operator = recordOrEmpty(condition).operator;
          return operator === undefined || operator === "CONTAINS";
        })
      ) {
        throw providerInputError("Each condition group must include a CONTAINS condition");
      }
      for (const rangeValue of looseArray(group.rangeConditions)) {
        const range = recordOrEmpty(rangeValue);
        if (Number(range.min) > Number(range.max)) throw providerInputError("rangeConditions min must not exceed max");
      }
    }
    if (conditionCount > 25) throw providerInputError("conditionGroups must contain at most 25 conditions in total");
  }
  for (const field of rangeFields) {
    const range = looseArray(input[field]);
    if (
      range.length === 2 &&
      (!range.every((value) => String(value).trim().length > 0 && Number.isFinite(Number(value))) ||
        Number(range[0]) > Number(range[1]))
    ) {
      throw providerInputError(`${field} must contain finite lower and upper bounds in ascending order`);
    }
  }
}
