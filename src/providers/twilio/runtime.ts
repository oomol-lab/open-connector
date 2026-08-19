import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalInteger, optionalString, optionalStringArray, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const twilioApiBaseUrl: string = "https://api.twilio.com/2010-04-01";

interface TwilioActionContext {
  accountSid: string;
  authToken: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface TwilioRequestInput extends TwilioActionContext {
  method?: string;
  path: string;
  query?: Array<[string, string | number | undefined]>;
  body?: URLSearchParams;
  phase: "validate" | "execute";
}

interface TwilioAccountPayload {
  sid?: unknown;
  friendly_name?: unknown;
  status?: unknown;
  type?: unknown;
}

interface TwilioUsageRecordPayload {
  account_sid?: unknown;
  category?: unknown;
  count?: unknown;
  count_unit?: unknown;
  usage?: unknown;
  usage_unit?: unknown;
  price?: unknown;
  price_unit?: unknown;
  start_date?: unknown;
  end_date?: unknown;
}

interface TwilioMessagePayload {
  sid?: unknown;
  account_sid?: unknown;
  status?: unknown;
  to?: unknown;
  from?: unknown;
  body?: unknown;
}

interface TwilioCallPayload {
  sid?: unknown;
  account_sid?: unknown;
  status?: unknown;
  direction?: unknown;
  to?: unknown;
  from?: unknown;
  duration?: unknown;
  price?: unknown;
  price_unit?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  date_created?: unknown;
  date_updated?: unknown;
  phone_number_sid?: unknown;
  parent_call_sid?: unknown;
  queue_time?: unknown;
  uri?: unknown;
}

type TwilioActionHandler = (input: Record<string, unknown>, context: TwilioActionContext) => Promise<unknown>;

export const twilioActionHandlers: ProviderActionHandlers<"twilio", TwilioActionHandler> = {
  get_account(_input, context) {
    return twilioGetAccount(context);
  },
  list_usage_records(input, context) {
    return twilioListUsageRecords(input, context);
  },
  list_messages(input, context) {
    return twilioListMessages(input, context);
  },
  get_message(input, context) {
    return twilioGetMessage(input, context);
  },
  send_message(input, context) {
    return twilioSendMessage(input, context);
  },
  list_calls(input, context) {
    return twilioListCalls(input, context);
  },
  get_call(input, context) {
    return twilioGetCall(input, context);
  },
  create_call(input, context) {
    return twilioCreateCall(input, context);
  },
};

export async function validateTwilioCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const accountSid = requireTwilioField(values.accountSid, "accountSid");
  const authToken = requireTwilioField(values.authToken, "authToken");
  const account = await twilioRequest<TwilioAccountPayload>({
    accountSid,
    authToken,
    path: `/Accounts/${encodeURIComponent(accountSid)}.json`,
    fetcher,
    signal,
    phase: "validate",
  });
  return {
    profile: {
      accountId: optionalString(account.sid) ?? accountSid,
      displayName: optionalString(account.friendly_name) ?? accountSid,
    },
    grantedScopes: [],
    metadata: {
      accountSid: optionalString(account.sid) ?? accountSid,
    },
  };
}

async function twilioGetAccount(context: TwilioActionContext): Promise<unknown> {
  const account = await twilioRequest<TwilioAccountPayload>({
    ...context,
    path: `/Accounts/${encodeURIComponent(context.accountSid)}.json`,
    phase: "execute",
  });
  return normalizeTwilioAccount(account);
}

async function twilioListUsageRecords(input: Record<string, unknown>, context: TwilioActionContext): Promise<unknown> {
  const payload = await twilioRequest<{
    usage_records?: TwilioUsageRecordPayload[];
    page?: unknown;
    page_size?: unknown;
    next_page_uri?: unknown;
  }>({
    ...context,
    path: `/Accounts/${encodeURIComponent(context.accountSid)}/Usage/Records.json`,
    query: [
      ["Category", optionalString(input.category)],
      ["StartDate", optionalString(input.startDate)],
      ["EndDate", optionalString(input.endDate)],
      ["PageSize", optionalPositiveInteger(input.pageSize, "pageSize")],
    ],
    phase: "execute",
  });

  return {
    usageRecords: (payload.usage_records ?? []).map((record) => normalizeTwilioUsageRecord(record)),
    page: optionalInteger(payload.page) ?? null,
    pageSize: optionalInteger(payload.page_size) ?? null,
    nextPageUri: optionalString(payload.next_page_uri) ?? null,
  };
}

async function twilioListMessages(input: Record<string, unknown>, context: TwilioActionContext): Promise<unknown> {
  const payload = await twilioRequest<{
    messages?: TwilioMessagePayload[];
    next_page_uri?: unknown;
  }>({
    ...context,
    path: `/Accounts/${encodeURIComponent(context.accountSid)}/Messages.json`,
    query: [
      ["To", optionalString(input.to)],
      ["From", optionalString(input.from)],
      ["PageSize", optionalPositiveInteger(input.pageSize, "pageSize")],
      ["PageToken", optionalString(input.pageToken)],
    ],
    phase: "execute",
  });
  return {
    messages: (payload.messages ?? []).map((message) => normalizeTwilioMessage(message)),
    nextPageUri: optionalString(payload.next_page_uri) ?? null,
  };
}

async function twilioGetMessage(input: Record<string, unknown>, context: TwilioActionContext): Promise<unknown> {
  const messageSid = requireTwilioField(input.messageSid, "messageSid");
  const payload = await twilioRequest<TwilioMessagePayload>({
    ...context,
    path: `/Accounts/${encodeURIComponent(context.accountSid)}/Messages/${encodeURIComponent(messageSid)}.json`,
    phase: "execute",
  });
  return normalizeTwilioMessage(payload);
}

async function twilioSendMessage(input: Record<string, unknown>, context: TwilioActionContext): Promise<unknown> {
  const body = new URLSearchParams();
  body.append("To", requireTwilioField(input.to, "to"));
  body.append("From", requireTwilioField(input.from, "from"));
  body.append("Body", requireTwilioField(input.body, "body"));
  const payload = await twilioRequest<TwilioMessagePayload>({
    ...context,
    method: "POST",
    path: `/Accounts/${encodeURIComponent(context.accountSid)}/Messages.json`,
    body,
    phase: "execute",
  });
  return normalizeTwilioMessage(payload);
}

async function twilioListCalls(input: Record<string, unknown>, context: TwilioActionContext): Promise<unknown> {
  const payload = await twilioRequest<{
    calls?: TwilioCallPayload[];
    page?: unknown;
    page_size?: unknown;
    next_page_uri?: unknown;
    previous_page_uri?: unknown;
  }>({
    ...context,
    path: `/Accounts/${encodeURIComponent(context.accountSid)}/Calls.json`,
    query: [
      ["To", optionalString(input.to)],
      ["From", optionalString(input.from)],
      ["Status", optionalString(input.status)],
      ["StartTime>", optionalString(input.startTime)],
      ["StartTime<", optionalString(input.endTime)],
      ["ParentCallSid", optionalString(input.parentCallSid)],
      ["PageSize", optionalPositiveInteger(input.pageSize, "pageSize")],
      ["PageToken", optionalString(input.pageToken)],
    ],
    phase: "execute",
  });

  return {
    calls: (payload.calls ?? []).map((call) => normalizeTwilioCall(call)),
    page: optionalInteger(payload.page) ?? null,
    pageSize: optionalInteger(payload.page_size) ?? null,
    nextPageUri: optionalString(payload.next_page_uri) ?? null,
    previousPageUri: optionalString(payload.previous_page_uri) ?? null,
  };
}

async function twilioGetCall(input: Record<string, unknown>, context: TwilioActionContext): Promise<unknown> {
  const callSid = requireTwilioField(input.callSid, "callSid");
  const payload = await twilioRequest<TwilioCallPayload>({
    ...context,
    path: `/Accounts/${encodeURIComponent(context.accountSid)}/Calls/${encodeURIComponent(callSid)}.json`,
    phase: "execute",
  });
  return normalizeTwilioCall(payload);
}

async function twilioCreateCall(input: Record<string, unknown>, context: TwilioActionContext): Promise<unknown> {
  const body = new URLSearchParams();
  body.append("To", requireTwilioField(input.to, "to"));
  body.append("From", requireTwilioField(input.from, "from"));

  const url = optionalString(input.url);
  const twiml = optionalString(input.twiml);
  if ((url === undefined) === (twiml === undefined)) {
    throw new ProviderRequestError(400, "Exactly one of url or twiml is required");
  }
  if (url !== undefined) body.append("Url", url);
  if (twiml !== undefined) body.append("Twiml", twiml);

  appendTwilioBodyField(body, "Method", optionalString(input.method));
  appendTwilioBodyField(body, "FallbackUrl", optionalString(input.fallbackUrl));
  appendTwilioBodyField(body, "FallbackMethod", optionalString(input.fallbackMethod));
  appendTwilioBodyField(body, "StatusCallback", optionalString(input.statusCallback));
  appendTwilioBodyField(body, "StatusCallbackMethod", optionalString(input.statusCallbackMethod));
  for (const event of optionalStringArray(input.statusCallbackEvent) ?? []) {
    body.append("StatusCallbackEvent", event);
  }

  const payload = await twilioRequest<TwilioCallPayload>({
    ...context,
    method: "POST",
    path: `/Accounts/${encodeURIComponent(context.accountSid)}/Calls.json`,
    body,
    phase: "execute",
  });
  return normalizeTwilioCall(payload);
}

async function twilioRequest<T>(input: TwilioRequestInput): Promise<T> {
  const url = new URL(`${twilioApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method ?? (input.body ? "POST" : "GET"),
      headers: {
        authorization: buildTwilioAuthorizationHeader(input.accountSid, input.authToken),
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: input.body ? input.body.toString() : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Twilio request failed: ${error.message}` : "Twilio request failed",
    );
  }

  if (response.ok) {
    return (await response.json()) as T;
  }

  const message = await readTwilioError(response);
  if (response.status === 429) throw new ProviderRequestError(429, message);
  if (input.phase === "validate" && response.status === 401) throw new ProviderRequestError(400, message);
  if (input.phase === "execute" && response.status === 401) throw new ProviderRequestError(401, message);
  throw new ProviderRequestError(response.status || 502, message);
}

function normalizeTwilioAccount(payload: TwilioAccountPayload): Record<string, unknown> {
  return {
    accountSid: optionalString(payload.sid) ?? "",
    friendlyName: optionalString(payload.friendly_name) ?? null,
    status: optionalString(payload.status) ?? null,
    type: optionalString(payload.type) ?? null,
  };
}

function normalizeTwilioUsageRecord(payload: TwilioUsageRecordPayload): Record<string, unknown> {
  return {
    accountSid: optionalString(payload.account_sid) ?? null,
    category: optionalString(payload.category) ?? null,
    count: optionalString(payload.count) ?? null,
    countUnit: optionalString(payload.count_unit) ?? null,
    usage: optionalString(payload.usage) ?? null,
    usageUnit: optionalString(payload.usage_unit) ?? null,
    price: optionalString(payload.price) ?? null,
    priceUnit: optionalString(payload.price_unit) ?? null,
    startDate: optionalString(payload.start_date) ?? null,
    endDate: optionalString(payload.end_date) ?? null,
  };
}

function normalizeTwilioMessage(payload: TwilioMessagePayload): Record<string, unknown> {
  return {
    messageSid: optionalString(payload.sid) ?? "",
    accountSid: optionalString(payload.account_sid) ?? null,
    status: optionalString(payload.status) ?? null,
    to: optionalString(payload.to) ?? null,
    from: optionalString(payload.from) ?? null,
    body: optionalString(payload.body) ?? null,
  };
}

function normalizeTwilioCall(payload: TwilioCallPayload): Record<string, unknown> {
  return {
    callSid: optionalString(payload.sid) ?? "",
    accountSid: optionalString(payload.account_sid) ?? null,
    status: optionalString(payload.status) ?? null,
    direction: optionalString(payload.direction) ?? null,
    to: optionalString(payload.to) ?? null,
    from: optionalString(payload.from) ?? null,
    duration: optionalString(payload.duration) ?? null,
    price: optionalString(payload.price) ?? null,
    priceUnit: optionalString(payload.price_unit) ?? null,
    startTime: optionalString(payload.start_time) ?? null,
    endTime: optionalString(payload.end_time) ?? null,
    dateCreated: optionalString(payload.date_created) ?? null,
    dateUpdated: optionalString(payload.date_updated) ?? null,
    phoneNumberSid: optionalString(payload.phone_number_sid) ?? null,
    parentCallSid: optionalString(payload.parent_call_sid) ?? null,
    queueTime: optionalString(payload.queue_time) ?? null,
    uri: optionalString(payload.uri) ?? null,
  };
}

function appendTwilioBodyField(body: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) body.append(key, value);
}

async function readTwilioError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown; detail?: unknown; code?: unknown };
    const message =
      optionalString(payload.message) ??
      optionalString(payload.detail) ??
      `Twilio request failed with ${response.status}`;
    const code = optionalString(payload.code);
    return code ? `${message} (${code})` : message;
  } catch {
    return (await response.text().catch(() => "")) || `Twilio request failed with ${response.status}`;
  }
}

export function buildTwilioAuthorizationHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function requireTwilioField(value: unknown, name: string): string {
  return requiredString(value, name, (message) => new ProviderRequestError(400, message));
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) return undefined;
  if (parsed <= 0) throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}
