import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Validator } from "@cfworker/json-schema";
import { createHash } from "node:crypto";
import { compactObject, objectArray, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

type HttpsmsRequestPhase = "validate" | "execute";
type HttpsmsRequestMethod = "DELETE" | "GET" | "POST";
type HttpsmsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface HttpsmsRequestInput {
  path: string;
  method: HttpsmsRequestMethod;
  apiKey: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  phase: HttpsmsRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface HttpsmsNormalizedResponse {
  status: string;
  responseMessage: string;
}

const httpsmsRequestTimeoutMs = 30_000;
const httpsmsEmailValidator = new Validator({ type: "string", format: "email" }, "2020-12");
export const httpsmsApiBaseUrl = "https://api.httpsms.com/v1";

export const httpsmsActionHandlers: ProviderActionHandlers<"httpsms", HttpsmsActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  get_billing_usage(_input, context) {
    return getBillingUsage(context);
  },
  list_billing_usage_history(input, context) {
    return listBillingUsageHistory(input, context);
  },
  list_phones(input, context) {
    return listPhones(input, context);
  },
  send_message(input, context) {
    return sendMessage(input, context);
  },
  list_messages(input, context) {
    return listMessages(input, context);
  },
  get_message(input, context) {
    return getMessage(input, context);
  },
  delete_message(input, context) {
    return deleteMessage(input, context);
  },
  list_message_threads(input, context) {
    return listMessageThreads(input, context);
  },
};

export async function validateHttpsmsCredential(
  apiKeyInput: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = normalizeHttpsmsApiKey(apiKeyInput);
  const payload = await requestHttpsmsJson({
    path: "/users/me",
    method: "GET",
    apiKey,
    phase: "validate",
    fetcher,
    signal,
  });
  const data = validateHttpsmsUser(sanitizeUser(readResponseObjectData(payload, "/users/me")));
  const userId = optionalString(data.id);
  const email = optionalString(data.email);
  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");

  return {
    profile: {
      accountId: userId ? `httpsms:${userId}` : `httpsms:${apiKeyHash.slice(0, 16)}`,
      displayName: email ?? userId ?? "httpSMS Account",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      userId,
      email,
      timezone: optionalString(data.timezone),
      subscriptionName: optionalString(data.subscription_name),
      subscriptionStatus: optionalString(data.subscription_status),
      apiKeyHash,
    }),
  };
}

async function getCurrentUser(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestActionJson(context, { path: "/users/me", method: "GET" });
  return {
    ...normalizeResponseEnvelope(payload),
    user: validateHttpsmsUser(sanitizeUser(readResponseObjectData(payload, "/users/me"))),
  };
}

async function getBillingUsage(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestActionJson(context, { path: "/billing/usage", method: "GET" });
  return {
    ...normalizeResponseEnvelope(payload),
    usage: validateHttpsmsUsage(readResponseObjectData(payload, "/billing/usage")),
  };
}

async function listBillingUsageHistory(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestActionJson(context, {
    path: "/billing/usage-history",
    method: "GET",
    query: pickPagingQuery(input),
  });
  return {
    ...normalizeResponseEnvelope(payload),
    usages: readResponseObjectArrayData(payload, "/billing/usage-history").map(validateHttpsmsUsage),
  };
}

async function listPhones(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestActionJson(context, {
    path: "/phones",
    method: "GET",
    query: pickListQuery(input),
  });
  return {
    ...normalizeResponseEnvelope(payload),
    phones: readResponseObjectArrayData(payload, "/phones").map(validateHttpsmsPhone),
  };
}

async function sendMessage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestActionJson(context, {
    path: "/messages/send",
    method: "POST",
    body: compactObject({
      attachments: input.attachments,
      content: input.content,
      encrypted: input.encrypted,
      from: input.from,
      request_id: input.requestId,
      send_at: input.sendAt,
      to: input.to,
    }),
  });
  return {
    ...normalizeResponseEnvelope(payload),
    message: validateHttpsmsMessage(readResponseObjectData(payload, "/messages/send")),
  };
}

async function listMessages(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestActionJson(context, {
    path: "/messages",
    method: "GET",
    query: compactObject({
      owner: input.owner,
      contact: input.contact,
      ...pickListQuery(input),
    }),
  });
  return {
    ...normalizeResponseEnvelope(payload),
    messages: readResponseObjectArrayData(payload, "/messages").map(validateHttpsmsMessage),
  };
}

async function getMessage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestActionJson(context, {
    path: `/messages/${encodeURIComponent(String(input.messageId))}`,
    method: "GET",
  });
  return {
    ...normalizeResponseEnvelope(payload),
    message: validateHttpsmsMessage(readResponseObjectData(payload, "/messages/{messageID}")),
  };
}

async function deleteMessage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestActionJson(context, {
    path: `/messages/${encodeURIComponent(String(input.messageId))}`,
    method: "DELETE",
  });
  return {
    deleted: true,
    ...normalizeResponseEnvelope(payload),
  };
}

async function listMessageThreads(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestActionJson(context, {
    path: "/message-threads",
    method: "GET",
    query: compactObject({
      owner: input.owner,
      ...pickListQuery(input),
    }),
  });
  return {
    ...normalizeResponseEnvelope(payload),
    threads: readResponseObjectArrayData(payload, "/message-threads").map(validateHttpsmsMessageThread),
  };
}

function requestActionJson(
  context: ApiKeyProviderContext,
  request: Omit<HttpsmsRequestInput, "apiKey" | "fetcher" | "phase" | "signal">,
): Promise<unknown> {
  return requestHttpsmsJson({
    ...request,
    apiKey: normalizeHttpsmsApiKey(context.apiKey),
    phase: "execute",
    fetcher: context.fetcher,
    signal: context.signal,
  });
}

async function requestHttpsmsJson(input: HttpsmsRequestInput): Promise<unknown> {
  const response = await requestHttpsmsRaw(input);
  const payload = await readHttpsmsPayload(response);
  if (!response.ok) {
    throw mapHttpsmsHttpError(response.status, readHttpsmsErrorMessage(payload), input.phase, payload);
  }
  return payload;
}

async function requestHttpsmsRaw(input: HttpsmsRequestInput): Promise<Response> {
  const timeout = createProviderTimeout(input.signal, httpsmsRequestTimeoutMs);
  try {
    return await input.fetcher(buildHttpsmsUrl(input.path, input.query), {
      method: input.method,
      headers: buildHttpsmsHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(
        504,
        `httpSMS ${input.path} request timed out after ${Math.ceil(httpsmsRequestTimeoutMs / 1000)} seconds`,
      );
    }
    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `httpSMS ${input.path} request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

function buildHttpsmsUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(trimLeadingSlash(path), `${httpsmsApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildHttpsmsHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readHttpsmsPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: { message: "action performed successfully", status: "success" },
    invalidJsonMessage: "httpSMS response was not valid JSON",
    invalidJsonFallback: (text) => (response.ok ? undefined : { message: text, status: "error" }),
  });
}

function normalizeResponseEnvelope(payload: unknown): HttpsmsNormalizedResponse {
  const object = optionalRecord(payload);
  return {
    status: optionalString(object?.status) ?? "success",
    responseMessage: optionalString(object?.message) ?? "Request handled successfully",
  };
}

function readResponseObjectData(payload: unknown, path: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  const data = optionalRecord(object?.data);
  if (!data) {
    throw new ProviderRequestError(502, `httpSMS ${path} response data is not an object`);
  }
  return data;
}

function readResponseObjectArrayData(payload: unknown, path: string): Array<Record<string, unknown>> {
  const object = optionalRecord(payload);
  return objectArray(
    object?.data,
    `httpSMS ${path} response data`,
    () => new ProviderRequestError(502, `httpSMS ${path} response data is not an array of objects`),
  );
}

function sanitizeUser(user: Record<string, unknown>): Record<string, unknown> {
  const { api_key: _apiKey, ...safeUser } = user;
  return safeUser;
}

function validateHttpsmsUser(user: Record<string, unknown>): Record<string, unknown> {
  for (const field of ["id", "email", "timezone", "subscription_name", "subscription_status"]) {
    if (user[field] !== undefined && typeof user[field] !== "string") {
      throw invalidHttpsmsField(`user.${field}`, "a string", user);
    }
  }
  if (typeof user.email === "string" && !httpsmsEmailValidator.validate(user.email).valid) {
    throw invalidHttpsmsField("user.email", "a valid email address", user);
  }
  return user;
}

function validateHttpsmsUsage(usage: Record<string, unknown>): Record<string, unknown> {
  for (const field of ["id", "start_timestamp", "end_timestamp"]) {
    if (usage[field] !== undefined && typeof usage[field] !== "string") {
      throw invalidHttpsmsField(`usage.${field}`, "a string", usage);
    }
  }
  for (const field of ["sent_messages", "received_messages", "total_cost"]) {
    if (usage[field] !== undefined && !Number.isInteger(usage[field])) {
      throw invalidHttpsmsField(`usage.${field}`, "an integer", usage);
    }
  }
  return usage;
}

function validateHttpsmsPhone(phone: Record<string, unknown>): Record<string, unknown> {
  for (const field of ["id", "phone_number", "sim"]) {
    if (phone[field] !== undefined && typeof phone[field] !== "string") {
      throw invalidHttpsmsField(`phone.${field}`, "a string", phone);
    }
  }
  for (const field of ["messages_per_minute", "max_send_attempts"]) {
    if (phone[field] !== undefined && !Number.isInteger(phone[field])) {
      throw invalidHttpsmsField(`phone.${field}`, "an integer", phone);
    }
  }
  return phone;
}

function validateHttpsmsMessage(message: Record<string, unknown>): Record<string, unknown> {
  for (const field of ["id", "owner", "contact", "content", "status", "type"]) {
    if (message[field] !== undefined && typeof message[field] !== "string") {
      throw invalidHttpsmsField(`message.${field}`, "a string", message);
    }
  }
  const requestId = message.request_id;
  if (requestId !== undefined && requestId !== null && typeof requestId !== "string") {
    throw invalidHttpsmsField("message.request_id", "a string or null", message);
  }
  return message;
}

function validateHttpsmsMessageThread(thread: Record<string, unknown>): Record<string, unknown> {
  for (const field of ["id", "owner", "contact", "last_message_id", "last_message_content", "status"]) {
    if (thread[field] !== undefined && typeof thread[field] !== "string") {
      throw invalidHttpsmsField(`message thread.${field}`, "a string", thread);
    }
  }
  if (thread.is_archived !== undefined && typeof thread.is_archived !== "boolean") {
    throw invalidHttpsmsField("message thread.is_archived", "a boolean", thread);
  }
  return thread;
}

function invalidHttpsmsField(field: string, expected: string, payload: unknown): ProviderRequestError {
  return new ProviderRequestError(502, `httpSMS ${field} must be ${expected} when provided`, payload);
}

function pickPagingQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({ skip: input.skip, limit: input.limit });
}

function pickListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({ skip: input.skip, limit: input.limit, query: input.query });
}

function readHttpsmsErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const object = optionalRecord(payload);
  const data = optionalRecord(object?.data);
  if (data) {
    const details = Object.entries(data)
      .flatMap(([field, messages]) =>
        Array.isArray(messages) ? messages.map((message) => `${field}: ${String(message)}`) : [],
      )
      .join("; ");
    if (details) {
      return details;
    }
  }
  return optionalString(object?.message) ?? "httpSMS request failed";
}

function mapHttpsmsHttpError(
  status: number,
  message: string,
  phase: HttpsmsRequestPhase,
  payload: unknown,
): ProviderRequestError {
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function normalizeHttpsmsApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "httpSMS API key is required");
  }
  return trimmed;
}

function trimLeadingSlash(value: string): string {
  let result = value;
  while (result.startsWith("/")) {
    result = result.slice(1);
  }
  return result;
}
