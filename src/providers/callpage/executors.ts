import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "callpage";
const callpageApiBaseUrl = "https://core.callpage.io";
const callpageValidationPath = "/api/v1/external";
const callpageCallsHistoryPath = "/api/v3/external/calls/history";
const callpageGetCallPathPrefix = "/api/v3/external/calls/";
const callpageUsersPath = "/api/v1/external/users/all";
const callpageGetUserPath = "/api/v1/external/users/get";
const callpageWidgetsPath = "/api/v1/external/widgets/all";
const callpageGetWidgetPath = "/api/v1/external/widgets/get";
const callpageCreateWidgetCallPath = "/api/v1/external/widgets/call";

type CallpagePhase = "validate" | "execute";
type CallpageActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const callpageActionHandlers: ProviderActionHandlers<"callpage", CallpageActionHandler> = {
  list_calls(input, context) {
    return executeListCalls(input, context);
  },
  get_call(input, context) {
    return executeGetCall(input, context);
  },
  list_users(input, context) {
    return executeListUsers(input, context);
  },
  get_user(input, context) {
    return executeGetUser(input, context);
  },
  list_widgets(input, context) {
    return executeListWidgets(input, context);
  },
  get_widget(input, context) {
    return executeGetWidget(input, context);
  },
  create_widget_call(input, context) {
    return executeCreateWidgetCall(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, callpageActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await callpageGetJson(
      callpageValidationPath,
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "callpage",
        displayName: "CallPage API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: callpageApiBaseUrl,
        validationEndpoint: callpageValidationPath,
        welcomeMessage: typeof payload.message === "string" ? payload.message : undefined,
      }),
    };
  },
};

async function executeListCalls(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const url = new URL(callpageCallsHistoryPath, callpageApiBaseUrl);
  appendOptionalBoolean(url, "display_hidden", optionalBoolean(input.display_hidden));
  appendOptionalIntegerArray(url, "call_id[]", input.call_ids);
  appendOptionalString(url, "phone_number", optionalString(input.phone_number));
  appendOptionalIntegerArray(url, "user_ids[]", input.user_ids);
  appendOptionalStringArray(url, "statuses[]", input.statuses);
  appendOptionalIntegerArray(url, "tag_ids[]", input.tag_ids);
  appendOptionalInteger(url, "date_from", input.date_from);
  appendOptionalInteger(url, "date_to", input.date_to);
  appendOptionalIntegerArray(url, "widget_ids[]", input.widget_ids);
  appendOptionalInteger(url, "limit", input.limit);
  appendOptionalInteger(url, "offset", input.offset);
  appendOptionalString(url, "url", optionalString(input.url));
  appendOptionalIntegerArray(url, "incoming_number_ids[]", input.incoming_number_ids);

  const payload = await callpageRequestEnvelope(
    url,
    {
      method: "GET",
      headers: callpageHeaders(context.apiKey, {
        accept: "application/json",
      }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );

  return {
    calls: Array.isArray(payload.data) ? payload.data : [],
    pagination: optionalRecord(payload.meta) ?? null,
  };
}

async function executeGetCall(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const callId = readRequiredPositiveInteger(input.call_id, "call_id");
  const payload = await callpageGetJson(
    `${callpageGetCallPathPrefix}${encodeURIComponent(String(callId))}`,
    context,
    "execute",
  );

  return {
    call: ensureObject(payload.data, "CallPage call payload"),
  };
}

async function executeListUsers(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const url = new URL(callpageUsersPath, callpageApiBaseUrl);
  appendOptionalInteger(url, "offset", input.offset);
  appendOptionalInteger(url, "limit", input.limit);

  const payload = await callpageRequestEnvelope(
    url,
    {
      method: "GET",
      headers: callpageHeaders(context.apiKey, {
        accept: "application/json",
      }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );

  return {
    users: Array.isArray(payload.data) ? payload.data : [],
    pagination: optionalRecord(payload.meta) ?? null,
  };
}

async function executeGetUser(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  validateCallpageUserLookupInput(input);
  const url = new URL(callpageGetUserPath, callpageApiBaseUrl);
  appendOptionalInteger(url, "id", input.id);
  appendOptionalString(url, "email", optionalString(input.email));

  const payload = await callpageRequestEnvelope(
    url,
    {
      method: "GET",
      headers: callpageHeaders(context.apiKey, {
        accept: "application/json",
      }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );

  return {
    user: ensureObject(payload.data, "CallPage user payload"),
  };
}

async function executeListWidgets(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const url = new URL(callpageWidgetsPath, callpageApiBaseUrl);
  appendOptionalInteger(url, "offset", input.offset);
  appendOptionalInteger(url, "limit", input.limit);

  const payload = await callpageRequestEnvelope(
    url,
    {
      method: "GET",
      headers: callpageHeaders(context.apiKey, {
        accept: "application/json",
      }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );

  return {
    widgets: Array.isArray(payload.data) ? payload.data : [],
    pagination: optionalRecord(payload.meta) ?? null,
  };
}

async function executeGetWidget(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const url = new URL(callpageGetWidgetPath, callpageApiBaseUrl);
  appendOptionalInteger(url, "widget_id", input.widget_id);

  const payload = await callpageRequestEnvelope(
    url,
    {
      method: "GET",
      headers: callpageHeaders(context.apiKey, {
        accept: "application/json",
      }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );

  return {
    widget: ensureObject(payload.data, "CallPage widget payload"),
  };
}

async function executeCreateWidgetCall(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  validateCreateWidgetCallInput(input);
  const payload = await callpagePostJson(
    callpageCreateWidgetCallPath,
    compactObject({
      id: readRequiredPositiveInteger(input.widget_id, "widget_id"),
      tel: readRequiredString(input.tel, "tel"),
      department_id: optionalInteger(input.department_id),
      manager_id: optionalInteger(input.manager_id),
    }),
    context,
  );

  const data = ensureObject(payload.data, "CallPage widget call payload");
  const callRequestId = optionalInteger(data.id);
  if (callRequestId === undefined) {
    throw new ProviderRequestError(502, "CallPage widget call response did not include id");
  }

  return {
    call_request_id: callRequestId,
  };
}

async function callpageGetJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: CallpagePhase,
): Promise<Record<string, unknown>> {
  return callpageRequestEnvelope(
    new URL(path, callpageApiBaseUrl),
    {
      method: "GET",
      headers: callpageHeaders(context.apiKey, {
        accept: "application/json",
      }),
      signal: context.signal,
    },
    phase,
    context.fetcher,
  );
}

async function callpagePostJson(
  path: string,
  body: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  return callpageRequestEnvelope(
    new URL(path, callpageApiBaseUrl),
    {
      method: "POST",
      headers: callpageHeaders(context.apiKey, {
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );
}

async function callpageRequestEnvelope(
  url: URL,
  init: RequestInit,
  phase: CallpagePhase,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CallPage request failed: ${error.message}` : "CallPage request failed",
    );
  }

  const payload = await readCallpagePayload(response);
  const message = extractCallpageMessage(payload) ?? response.statusText ?? "CallPage request failed";
  const providerErrorCode = extractCallpageProviderErrorCode(payload);
  const hasError = isCallpageError(payload);

  if (!response.ok || hasError) {
    throw createCallpageError(response.status, providerErrorCode, message, phase, payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "CallPage returned an invalid response envelope");
  }

  return record;
}

async function readCallpagePayload(response: Response): Promise<unknown> {
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

function isCallpageError(payload: unknown): boolean {
  const record = optionalRecord(payload);
  return record?.hasError === true;
}

function extractCallpageProviderErrorCode(payload: unknown): number | undefined {
  const record = optionalRecord(payload);
  return optionalInteger(record?.errorCode);
}

function extractCallpageMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message);
}

function createCallpageError(
  status: number,
  providerErrorCode: number | undefined,
  message: string,
  phase: CallpagePhase,
  payload: unknown,
): ProviderRequestError {
  const normalizedStatus = status || providerErrorCode || 500;
  if (normalizedStatus === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (normalizedStatus === 401 || normalizedStatus === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (normalizedStatus === 401 || normalizedStatus === 403)) {
    return new ProviderRequestError(normalizedStatus, message, payload);
  }
  if ([400, 404, 422].includes(normalizedStatus)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(normalizedStatus, message, payload);
}

function callpageHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    Authorization: apiKey,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

function appendOptionalString(url: URL, key: string, value: string | undefined): void {
  if (value) {
    url.searchParams.set(key, value);
  }
}

function appendOptionalInteger(url: URL, key: string, value: unknown): void {
  const parsed = optionalInteger(value);
  if (parsed !== undefined) {
    url.searchParams.set(key, String(parsed));
  }
}

function appendOptionalBoolean(url: URL, key: string, value: boolean | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(key, value ? "1" : "0");
  }
}

function appendOptionalIntegerArray(url: URL, key: string, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    const parsed = optionalInteger(item);
    if (parsed !== undefined) {
      url.searchParams.append(key, String(parsed));
    }
  }
}

function appendOptionalStringArray(url: URL, key: string, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    const parsed = optionalString(item);
    if (parsed) {
      url.searchParams.append(key, parsed);
    }
  }
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function ensureObject(value: unknown, description: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${description} is missing`);
  }
  return record;
}

function validateCallpageUserLookupInput(input: Record<string, unknown>): void {
  const hasId = input.id !== undefined && input.id !== null;
  const hasEmail = input.email !== undefined && input.email !== null;
  if (!hasId && !hasEmail) {
    throw new ProviderRequestError(400, "Either id or email is required.");
  }
  if (hasId && hasEmail) {
    throw new ProviderRequestError(400, "Provide either id or email, not both.");
  }
}

function validateCreateWidgetCallInput(input: Record<string, unknown>): void {
  if (
    input.department_id !== undefined &&
    input.department_id !== null &&
    input.manager_id !== undefined &&
    input.manager_id !== null
  ) {
    throw new ProviderRequestError(400, "department_id and manager_id cannot be used together.");
  }
}
