import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const vonageApiBaseUrl = "https://rest.nexmo.com";
export const vonageReportsApiBaseUrl = "https://api.nexmo.com";
const vonageRequestTimeoutMs = 30_000;
const invalidInputSmsStatuses = new Set(["2", "3", "6", "7", "12", "15", "17", "22", "23", "29", "33"]);

export interface VonageContext {
  apiKey: string;
  apiSecret: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface VonageRequestInput {
  path: string;
  context: VonageContext;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  body?: URLSearchParams;
  baseUrl?: string;
  query?: Record<string, string | number | boolean | undefined>;
}

type VonageHandler = (input: Record<string, unknown>, context: VonageContext) => Promise<unknown>;

export const vonageActionHandlers: Record<string, VonageHandler> = {
  async get_balance(_input, context) {
    return normalizeBalance(await requestVonage({ path: "/account/get-balance", context, phase: "execute" }));
  },
  async send_sms(input, context) {
    const body = new URLSearchParams();
    appendRequiredFormField(body, "from", input.from);
    appendRequiredFormField(body, "to", input.to);
    appendRequiredFormField(body, "text", input.text);
    appendOptionalFormField(body, "type", optionalString(input.type));
    appendOptionalFormField(body, "ttl", optionalInteger(input.ttl));
    appendOptionalFormField(body, "status-report-req", optionalBoolean(input.statusReportRequired));
    appendOptionalFormField(body, "callback", optionalString(input.callback));
    appendOptionalFormField(body, "client-ref", optionalString(input.clientRef));
    return normalizeSms(await requestVonage({ path: "/sms/json", method: "POST", body, context, phase: "execute" }));
  },
  async list_sms_records(input, context) {
    const direction = requiredString(input.direction, "direction", invalidInput);
    const payload = await requestVonage({
      baseUrl: vonageReportsApiBaseUrl,
      path: "/v2/reports/records",
      context,
      phase: "execute",
      query: {
        product: "SMS",
        account_id: context.apiKey,
        direction,
        date_start: optionalString(input.dateStart),
        date_end: optionalString(input.dateEnd),
        cursor: optionalString(input.cursor),
        iv: optionalString(input.iv),
        status: optionalString(input.status),
        from: optionalString(input.from),
        to: optionalString(input.to),
        country: optionalString(input.country),
        network: optionalString(input.network),
        account_ref: optionalString(input.accountRef),
        include_message: optionalBoolean(input.includeMessage),
        show_concatenated: optionalBoolean(input.showConcatenated),
      },
    });
    return normalizeSmsReport(payload);
  },
  async get_sms_record(input, context) {
    const messageId = requiredString(input.messageId, "messageId", invalidInput);
    const direction = requiredString(input.direction, "direction", invalidInput);
    const payload = await requestVonage({
      baseUrl: vonageReportsApiBaseUrl,
      path: "/v2/reports/records",
      context,
      phase: "execute",
      query: {
        product: "SMS",
        account_id: context.apiKey,
        direction,
        id: messageId,
        include_message: optionalBoolean(input.includeMessage),
        show_concatenated: optionalBoolean(input.showConcatenated),
      },
    });
    return normalizeSmsReport(payload);
  },
};

export function createVonageContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): VonageContext {
  return {
    apiKey: requiredString(values.apiKey, "apiKey", invalidInput),
    apiSecret: requiredString(values.apiSecret, "apiSecret", invalidInput),
    fetcher,
    signal,
  };
}

export async function validateVonageCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createVonageContext(values, fetcher, signal);
  const balance = normalizeBalance(await requestVonage({ path: "/account/get-balance", context, phase: "validate" }));
  return {
    profile: { accountId: `vonage:${context.apiKey}`, displayName: `Vonage ${context.apiKey}` },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: vonageApiBaseUrl,
      validationEndpoint: "/account/get-balance",
      balanceAutoReload: balance.autoReload,
    },
  };
}

async function requestVonage(input: VonageRequestInput): Promise<unknown> {
  const url = new URL(`${input.baseUrl ?? vonageApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const timeout = createProviderTimeout(input.context.signal, vonageRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${input.context.apiKey}:${input.context.apiSecret}`).toString("base64")}`,
        ...(input.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body,
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Vonage returned invalid JSON",
    });
    if (!response.ok) throw mapHttpError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Vonage request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Vonage request failed: ${error.message}` : "Vonage request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function mapHttpError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Vonage request failed (${response.status})`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : 400, message, payload);
}

function normalizeBalance(payload: unknown): { value: number; autoReload: boolean } {
  const record = requireResponseRecord(payload, "Vonage balance response");
  if (typeof record.value !== "number" || typeof record.autoReload !== "boolean") {
    throw new ProviderRequestError(502, "Vonage returned an invalid balance response", payload);
  }
  return { value: record.value, autoReload: record.autoReload };
}

function normalizeSms(payload: unknown): unknown {
  const record = requireResponseRecord(payload, "Vonage SMS response");
  const messages = Array.isArray(record.messages) ? record.messages : [];
  if (messages.length === 0) throw new ProviderRequestError(502, "Vonage returned no SMS submission result");
  const normalizedMessages = messages.map((item) => {
    const message = requireResponseRecord(item, "Vonage SMS result");
    const status = requireResponseString(message.status, "status");
    if (status !== "0") throw mapSmsError(status, optionalString(message["error-text"]));
    return {
      to: requireResponseString(message.to, "to"),
      messageId: requireResponseString(message["message-id"], "message-id"),
      status,
      remainingBalance: optionalString(message["remaining-balance"]) ?? null,
      messagePrice: optionalString(message["message-price"]) ?? null,
      network: optionalString(message.network) ?? null,
      clientRef: optionalString(message["client-ref"]) ?? null,
    };
  });
  const declaredCount = Number.parseInt(optionalString(record["message-count"]) ?? "", 10);
  return {
    messageCount: Number.isFinite(declaredCount) ? declaredCount : normalizedMessages.length,
    messages: normalizedMessages,
  };
}

function normalizeSmsReport(payload: unknown): Record<string, unknown> {
  const record = requireResponseRecord(payload, "Vonage SMS report response");
  const records = Array.isArray(record.records) ? record.records : [];

  return {
    records: records.map((item) => normalizeSmsRecord(item)),
    requestId: optionalString(record.request_id) ?? null,
    requestStatus: optionalString(record.request_status) ?? null,
    itemsCount: optionalInteger(record.items_count) ?? null,
    idsNotFound: optionalString(record.ids_not_found) ?? null,
    nextCursor: optionalString(record.cursor) ?? null,
    iv: optionalString(record.iv) ?? null,
  };
}

function normalizeSmsRecord(value: unknown): Record<string, unknown> {
  const record = requireResponseRecord(value, "Vonage SMS report record");
  return {
    recordId: optionalString(record.id) ?? null,
    messageId: optionalString(record.message_id) ?? null,
    accountId: optionalString(record.account_id) ?? null,
    direction: optionalString(record.direction) ?? null,
    from: optionalString(record.from) ?? null,
    to: optionalString(record.to) ?? null,
    status: optionalString(record.status) ?? null,
    dateReceived: optionalString(record.date_received) ?? null,
    dateFinalized: optionalString(record.date_finalized) ?? null,
    totalPrice: optionalString(record.total_price) ?? null,
    currency: optionalString(record.currency) ?? null,
    clientRef: optionalString(record.client_ref) ?? null,
    network: optionalString(record.network) ?? null,
    networkName: optionalString(record.network_name) ?? null,
    country: optionalString(record.country) ?? null,
    countryName: optionalString(record.country_name) ?? null,
    messageBody: optionalString(record.message_body) ?? null,
    errorCode: optionalString(record.error_code) ?? null,
    errorCodeDescription: optionalString(record.error_code_description) ?? null,
  };
}

function mapSmsError(status: string, message?: string): ProviderRequestError {
  const text = message ?? `Vonage rejected the SMS with status ${status}`;
  if (status === "1" || status === "9" || status === "10") return new ProviderRequestError(429, text);
  if (["4", "8", "11", "14", "32"].includes(status)) return new ProviderRequestError(401, text);
  if (invalidInputSmsStatuses.has(status)) return new ProviderRequestError(400, text);
  return new ProviderRequestError(502, text);
}

function requireResponseRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`, value);
  return record;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) throw new ProviderRequestError(502, `Vonage response is missing ${fieldName}`);
  return text;
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.detail) ??
        optionalString(record.title) ??
        optionalString(record.message) ??
        optionalString(record["error-text"]))
    : undefined;
}

function appendRequiredFormField(body: URLSearchParams, key: string, value: unknown): void {
  body.set(key, requiredString(value, key, invalidInput));
}

function appendOptionalFormField(
  body: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined,
): void {
  if (value !== undefined) body.set(key, String(value));
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
