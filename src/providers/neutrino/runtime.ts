import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { NeutrinoActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { isAbortLikeError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const neutrinoApiBaseUrl = "https://neutrinoapi.net";

const validationIp = "1.1.1.1";

type NeutrinoRequestPhase = "validate" | "execute";

export interface NeutrinoActionContext {
  apiKey: string;
  userId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type NeutrinoQueryValue = string | number | boolean | undefined;

const neutrinoActionPathByName = {
  validate_email: "/email-validate",
  validate_phone: "/phone-validate",
  get_ip_info: "/ip-info",
  lookup_domain: "/domain-lookup",
  check_ip_blocklist: "/ip-blocklist",
} satisfies Record<NeutrinoActionName, string>;

export const neutrinoActionHandlers: ProviderActionHandlers<
  "neutrino",
  ProviderRuntimeHandler<NeutrinoActionContext>
> = {
  validate_email(input: Record<string, unknown>, context: NeutrinoActionContext): Promise<unknown> {
    return requestNeutrinoJsonForAction(context, "validate_email", [
      ["email", requiredString(input.email, "email", invalidInput)],
      ["fix-typos", optionalBoolean(input["fix-typos"])],
    ]);
  },
  validate_phone(input: Record<string, unknown>, context: NeutrinoActionContext): Promise<unknown> {
    return requestNeutrinoJsonForAction(context, "validate_phone", [
      ["number", requiredString(input.number, "number", invalidInput)],
      ["country-code", optionalString(input["country-code"])?.toUpperCase()],
      ["ip", optionalString(input.ip)],
    ]);
  },
  get_ip_info(input: Record<string, unknown>, context: NeutrinoActionContext): Promise<unknown> {
    return requestNeutrinoJsonForAction(context, "get_ip_info", [
      ["ip", requiredString(input.ip, "ip", invalidInput)],
      ["reverse-lookup", optionalBoolean(input["reverse-lookup"])],
    ]);
  },
  lookup_domain(input: Record<string, unknown>, context: NeutrinoActionContext): Promise<unknown> {
    return requestNeutrinoJsonForAction(context, "lookup_domain", [
      ["host", requiredString(input.host, "host", invalidInput)],
      ["live", optionalBoolean(input.live)],
    ]);
  },
  check_ip_blocklist(input: Record<string, unknown>, context: NeutrinoActionContext): Promise<unknown> {
    return requestNeutrinoJsonForAction(context, "check_ip_blocklist", [
      ["ip", requiredString(input.ip, "ip", invalidInput)],
      ["vpn-lookup", optionalBoolean(input["vpn-lookup"])],
    ]);
  },
};

export async function validateNeutrinoCredential(
  input: {
    apiKey: string;
    userId: string;
  },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", invalidInput);
  const userId = requiredString(input.userId, "userId", invalidInput);
  const payload = await requestNeutrinoJson({
    path: neutrinoActionPathByName.get_ip_info,
    query: [["ip", validationIp]],
    apiKey,
    userId,
    fetcher,
    signal,
    phase: "validate",
  });
  const record = optionalRecord(payload);

  return {
    profile: {
      accountId: userId,
      displayName: `Neutrino API User ${userId}`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: neutrinoApiBaseUrl,
      userId,
      validationEndpoint: neutrinoActionPathByName.get_ip_info,
      validatedIp: validationIp,
      validatedCountryCode: optionalString(record?.["country-code"]),
      validatedCountry: optionalString(record?.country),
    }),
  };
}

function requestNeutrinoJsonForAction(
  context: NeutrinoActionContext,
  actionName: NeutrinoActionName,
  query: Array<[string, unknown]>,
): Promise<unknown> {
  return requestNeutrinoJson({
    path: neutrinoActionPathByName[actionName],
    query,
    apiKey: context.apiKey,
    userId: context.userId,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function requestNeutrinoJson(input: {
  path: string;
  query: Array<[string, unknown]>;
  apiKey: string;
  userId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: NeutrinoRequestPhase;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildNeutrinoUrl(input.path, input.query), {
      method: "GET",
      headers: buildNeutrinoHeaders(input.apiKey, input.userId),
      signal: input.signal,
    });
    payload = await readNeutrinoPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? error.message : "Neutrino request failed",
    );
  }

  if (!response.ok) {
    throw mapNeutrinoError(response.status, payload, input.phase);
  }

  return payload;
}

function buildNeutrinoUrl(path: string, query: Array<[string, unknown]>): URL {
  const url = new URL(path, neutrinoApiBaseUrl);
  for (const [key, value] of query) {
    const queryValue = normalizeQueryValue(value);
    if (queryValue === undefined || queryValue === "") {
      continue;
    }
    url.searchParams.set(key, String(queryValue));
  }
  return url;
}

function normalizeQueryValue(value: unknown): NeutrinoQueryValue {
  if (value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function buildNeutrinoHeaders(apiKey: string, userId: string): Record<string, string> {
  return {
    "API-Key": apiKey,
    "User-ID": userId,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readNeutrinoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapNeutrinoError(status: number, payload: unknown, phase: NeutrinoRequestPhase): ProviderRequestError {
  const fallback = phase === "validate" ? "Neutrino credential validation failed" : "Neutrino request failed";
  const message = extractNeutrinoErrorMessage(payload) ?? fallback;
  const apiErrorCode = extractNeutrinoApiErrorCode(payload);
  if (status === 429 || isNeutrinoRateLimitError(apiErrorCode)) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractNeutrinoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.["api-error-msg"]) ?? optionalString(record?.message) ?? optionalString(record?.error);
}

function extractNeutrinoApiErrorCode(payload: unknown): number | undefined {
  const rawCode = optionalRecord(payload)?.["api-error"];
  if (typeof rawCode === "number" && Number.isInteger(rawCode)) {
    return rawCode;
  }
  if (typeof rawCode === "string" && rawCode.trim()) {
    const parsedCode = Number(rawCode.trim());
    return Number.isInteger(parsedCode) ? parsedCode : undefined;
  }
  return undefined;
}

function isNeutrinoRateLimitError(apiErrorCode: number | undefined): boolean {
  return apiErrorCode === 2 || apiErrorCode === 6 || apiErrorCode === 16 || apiErrorCode === 31;
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
