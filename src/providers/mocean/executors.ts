import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "mocean";
const moceanApiBaseUrl = "https://rest.moceanapi.com/rest/2";

type MoceanRequestPhase = "validate" | "execute";
type MoceanActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const moceanActionHandlers: ProviderActionHandlers<"mocean", MoceanActionHandler> = {
  get_balance(_input, context) {
    return requestMocean("GET", "/account/balance", context, {}, "execute").then(normalizeBalance);
  },
  list_pricing(input, context) {
    if ((input.mcc && !input.mnc) || (!input.mcc && input.mnc)) {
      throw new ProviderRequestError(400, "mcc and mnc must be provided together");
    }

    return requestMocean(
      "GET",
      "/account/pricing",
      context,
      compactObject({
        "mocean-type": optionalString(input.type),
        "mocean-mcc": optionalString(input.mcc),
        "mocean-mnc": optionalString(input.mnc),
      }),
      "execute",
    ).then(normalizePricing);
  },
  get_message_status(input, context) {
    return requestMocean(
      "GET",
      "/report/message",
      context,
      {
        "mocean-msgid": requireString(input.messageId, "messageId"),
      },
      "execute",
    ).then(normalizeMessageStatus);
  },
  lookup_number(input, context) {
    return requestMocean(
      "POST",
      "/nl",
      context,
      {
        "mocean-to": requireString(input.to, "to"),
      },
      "execute",
    ).then(normalizeNumberLookup);
  },
  send_sms(input, context) {
    return requestMocean(
      "POST",
      "/sms",
      context,
      compactObject({
        "mocean-from": requireString(input.from, "from"),
        "mocean-to": requireString(input.to, "to"),
        "mocean-text": requireString(input.text, "text"),
        "mocean-dlr-mask": input.deliveryReportUrl ? "1" : undefined,
        "mocean-dlr-url": optionalString(input.deliveryReportUrl),
      }),
      "execute",
    ).then(normalizeSendSms);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, moceanActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestMocean("GET", "/account/balance", context, {}, "validate");
    const balance = extractMoceanNumber(payload, "balance") ?? extractMoceanNumber(payload, "value");

    return {
      profile: {
        accountId: "api_key",
        displayName: "Mocean API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: moceanApiBaseUrl,
        validationEndpoint: "/account/balance",
        balance,
      }),
    };
  },
};

async function requestMocean(
  method: "GET" | "POST",
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  params: Record<string, unknown>,
  phase: MoceanRequestPhase,
): Promise<unknown> {
  const url = new URL(`${moceanApiBaseUrl}${path}`);
  const body = new URLSearchParams();

  if (method === "GET") {
    url.searchParams.set("mocean-resp-format", "json");
    appendMoceanParams(url.searchParams, params);
  } else {
    body.set("mocean-resp-format", "json");
    appendMoceanParams(body, params);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method,
      headers: moceanHeaders(context.apiKey, method),
      body: method === "POST" ? body : undefined,
      signal: context.signal,
    });
    payload = await readMoceanPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `mocean request failed: ${error.message}` : "mocean request failed",
    );
  }

  const providerError = readMoceanStatusError(payload);
  if (providerError) {
    throw mapMoceanStatusError(providerError.status, providerError.message, phase);
  }

  if (!response.ok) {
    throw mapMoceanHttpError(response, payload, phase);
  }

  return payload;
}

function moceanHeaders(apiKey: string, method: "GET" | "POST"): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}),
  };
}

function appendMoceanParams(target: URLSearchParams, params: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    target.set(key, String(value));
  }
}

function requireString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

async function readMoceanPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readMoceanStatusError(payload: unknown): { status: number; message: string } | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const status = optionalNumber(record.status);
  if (status === undefined || status === 0) {
    return undefined;
  }

  return {
    status,
    message: extractMoceanErrorMessage(record) ?? `mocean request failed with status ${status}`,
  };
}

function extractMoceanErrorMessage(record: Record<string, unknown>): string | undefined {
  return (
    optionalString(record.err_msg) ??
    optionalString(record.error_message) ??
    optionalString(record.message) ??
    optionalString(record.error)
  );
}

function mapMoceanStatusError(status: number, message: string, phase: MoceanRequestPhase): ProviderRequestError {
  if (status === 1) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (status === 32) {
    return new ProviderRequestError(429, message);
  }

  if ([2, 3, 5, 6, 14, 26, 28, 29, 34, 46, 51, 72].includes(status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(502, message);
}

function mapMoceanHttpError(response: Response, payload: unknown, phase: MoceanRequestPhase): ProviderRequestError {
  const payloadRecord = optionalRecord(payload);
  const message =
    typeof payload === "string" && payload.trim()
      ? payload
      : payloadRecord
        ? extractMoceanErrorMessage(payloadRecord)
        : undefined;
  const normalizedMessage = message ?? response.statusText ?? "mocean request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, normalizedMessage, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, normalizedMessage, payload);
  }

  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, normalizedMessage, payload);
  }

  return new ProviderRequestError(response.status || 500, normalizedMessage, payload);
}

function normalizeBalance(payload: unknown): Record<string, unknown> {
  const record = requireMoceanObject(payload);
  return {
    status: requireMoceanNumber(record, "status"),
    value: requireMoceanNumber(record, "value"),
  };
}

function normalizePricing(payload: unknown): Record<string, unknown> {
  const record = requireMoceanObject(payload);
  const destinations = record.destinations;
  return {
    status: requireMoceanNumber(record, "status"),
    destinations: Array.isArray(destinations)
      ? destinations.map((destination) => normalizePricingDestination(destination))
      : [],
  };
}

function normalizePricingDestination(destination: unknown): Partial<Record<string, unknown>> {
  const record = requireMoceanObject(destination);
  return compactObject({
    country: optionalString(record.country),
    operator: optionalString(record.operator),
    mcc: optionalString(record.mcc),
    mnc: optionalString(record.mnc),
    price: record.price == null ? undefined : String(record.price),
    currency: optionalString(record.currency),
  });
}

function normalizeMessageStatus(payload: unknown): Record<string, unknown> {
  const record = requireMoceanObject(payload);
  return {
    status: requireMoceanNumber(record, "status"),
    messageStatus: requireMoceanNumber(record, "message_status"),
    messageId: requireMoceanString(record, "msgid"),
    creditDeducted: requireMoceanString(record, "credit_deducted"),
  };
}

function normalizeNumberLookup(payload: unknown): Partial<Record<string, unknown>> {
  const record = requireMoceanObject(payload);
  return compactObject({
    status: requireMoceanNumber(record, "status"),
    messageId: pickMoceanString(record, "msgid", "message_id"),
    to: pickMoceanString(record, "to", "mocean-to"),
    currentCarrier: normalizeCarrier(record.current_carrier ?? record.currentCarrier),
    originalCarrier: normalizeCarrier(record.original_carrier ?? record.originalCarrier),
    ported: normalizePorted(record.ported),
  });
}

function normalizeCarrier(value: unknown): Partial<Record<string, unknown>> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    country: optionalString(record.country),
    name: pickMoceanString(record, "name", "carrier", "network"),
    networkCode: pickMoceanString(record, "network_code", "networkCode"),
    mcc: pickMoceanString(record, "mcc"),
    mnc: pickMoceanString(record, "mnc"),
  });
}

function normalizePorted(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["ported", "not_ported", "unknown"].includes(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeSendSms(payload: unknown): Record<string, unknown> {
  const record = requireMoceanObject(payload);
  const messages = record.messages;
  return {
    messages: Array.isArray(messages) ? messages.map((message) => normalizeSmsMessage(message)) : [],
  };
}

function normalizeSmsMessage(message: unknown): Partial<Record<string, unknown>> {
  const record = requireMoceanObject(message);
  return compactObject({
    status: requireMoceanNumber(record, "status"),
    receiver: optionalString(record.receiver),
    messageId: pickMoceanString(record, "msgid", "message_id"),
    errorMessage: pickMoceanString(record, "err_msg", "error_message"),
  });
}

function requireMoceanObject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "mocean response was not an object");
  }
  return record;
}

function requireMoceanString(record: Record<string, unknown>, key: string): string {
  const value = optionalString(record[key]);
  if (value === undefined) {
    throw new ProviderRequestError(502, `mocean response missing ${key}`);
  }
  return value;
}

function requireMoceanNumber(record: Record<string, unknown>, key: string): number {
  const value = extractMoceanNumber(record, key);
  if (value === undefined) {
    throw new ProviderRequestError(502, `mocean response missing ${key}`);
  }
  return value;
}

function extractMoceanNumber(value: unknown, key: string): number | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const child = record[key];
  if (typeof child === "number") {
    return child;
  }
  if (typeof child === "string" && child.trim() !== "") {
    const parsed = Number(child);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickMoceanString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}
