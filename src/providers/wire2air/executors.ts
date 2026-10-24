import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "wire2air";
const apiBaseUrl = "https://msgapi.wire2air.com/rest/v1";
const millisecondsPerDay = 24 * 60 * 60 * 1000;

const handlers: ProviderActionHandlers<
  "wire2air",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  send_message(input, context) {
    return requestWire2Air("send_message", input, context, "execute");
  },
  list_inbound_messages(input, context) {
    validateInboxDateRange(input);
    return requestWire2Air("list_inbound_messages", input, context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestWire2Air(
      "list_inbound_messages",
      { page: 1, pageSize: 1 },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    return {
      profile: { displayName: "Wire2Air API Key" },
      metadata: { apiBaseUrl, validationEndpoint: "/message/inbox" },
    };
  },
};

async function requestWire2Air(
  actionName: "send_message" | "list_inbound_messages",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  return runProviderRequest({ label: "Wire2Air", signal: context.signal }, async (signal) => {
    const isSend = actionName == "send_message";
    const url = new URL(isSend ? "/rest/v1/message" : "/rest/v1/message/inbox", apiBaseUrl);
    const body = isSend ? buildSendMessageBody(input) : undefined;
    if (!isSend) appendInboxQuery(url, input);
    const response = await context.fetcher(url, {
      method: isSend ? "POST" : "GET",
      headers: {
        accept: "application/json",
        apikey: context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, phase);
    if (!optionalRecord(payload)) throw new ProviderRequestError(502, "Wire2Air returned an invalid response");
    return payload;
  });
}

function buildSendMessageBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    to: optionalString(input.to),
    from: optionalString(input.from),
    text: typeof input.text == "string" ? input.text : undefined,
    deliverydatetime: optionalString(input.deliveryDateTime),
    replypath: optionalString(input.replyPath),
    batchname: optionalString(input.batchName),
  });
}

function appendInboxQuery(url: URL, input: Record<string, unknown>): void {
  const query = compactObject({
    datefrom: optionalString(input.dateFrom),
    dateto: optionalString(input.dateTo),
    TextNumber: optionalString(input.textNumber),
    PageNo: typeof input.page == "number" ? String(input.page) : undefined,
    PageSize: typeof input.pageSize == "number" ? String(input.pageSize) : undefined,
  });
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Wire2Air returned invalid JSON");
  }
}

function createError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message =
    optionalString(optionalRecord(payload)?.StatusMessage) ?? `Wire2Air request failed with status ${status}`;
  if (phase == "validate" && status == 401) return providerInputError(message);
  if (status == 429) return new ProviderRequestError(429, message, undefined, "rate_limited");
  return new ProviderRequestError(status, message);
}

function validateInboxDateRange(input: Record<string, unknown>): void {
  const dateFrom = parseInboxDate(input.dateFrom);
  const dateTo = parseInboxDate(input.dateTo);
  if (input.dateFrom !== undefined && dateFrom === undefined)
    throw providerInputError("dateFrom must use M/D/YYYY format");
  if (input.dateTo !== undefined && dateTo === undefined) throw providerInputError("dateTo must use M/D/YYYY format");
  if (dateFrom === undefined || dateTo === undefined) return;
  if (dateTo < dateFrom) throw providerInputError("dateTo must not be before dateFrom");
  if ((dateTo - dateFrom) / millisecondsPerDay > 31) throw providerInputError("date range cannot exceed 31 days");
}

function parseInboxDate(value: unknown): number | undefined {
  const parts = optionalString(value)?.split("/");
  if (!parts || parts.length != 3 || parts.some((part) => !isAsciiDigits(part))) return undefined;
  const month = Number(parts[0]);
  const day = Number(parts[1]);
  const year = Number(parts[2]);
  if (year < 1000 || year > 9999) return undefined;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() == year && date.getUTCMonth() == month - 1 && date.getUTCDate() == day
    ? timestamp
    : undefined;
}

function isAsciiDigits(value: string): boolean {
  return value.length > 0 && [...value].every((character) => "0" <= character && character <= "9");
}
