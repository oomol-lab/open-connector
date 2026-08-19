import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const v2exApiBaseUrl = "https://www.v2ex.com/api/v2";
export const v2exLegacyApiBaseUrl = "https://www.v2ex.com/api";

const v2exRequestTimeoutMs = 30_000;

type V2exRequestPhase = "validate" | "execute";
type V2exActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const v2exActionHandlers: ProviderActionHandlers<"v2ex", V2exActionHandler> = {
  async list_notifications(input, context) {
    const payload = await requestV2exJson({
      path: "/notifications",
      method: "GET",
      apiKey: context.apiKey,
      query: { p: input.p },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const envelope = unwrapV2exEnvelope(payload, "notifications", "execute");
    return {
      notifications: requireV2exArrayResult(envelope, "notifications"),
      total: parseV2exTotal(envelope.message, envelope.result),
    };
  },
  async delete_notification(input, context) {
    const payload = await requestV2exJson({
      path: `/notifications/${input.notification_id}`,
      method: "DELETE",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    ensureV2exAccepted(payload, "notification deletion");
    return { success: true };
  },
  async list_hot_topics(_input, context) {
    return { topics: await requestV2exLegacyArray({ path: "/topics/hot.json", ...context }) };
  },
  async list_latest_topics(_input, context) {
    return { topics: await requestV2exLegacyArray({ path: "/topics/latest.json", ...context }) };
  },
  async get_current_member(_input, context) {
    const payload = await requestV2exJson({
      path: "/member",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      member: requireV2exObjectResult(unwrapV2exEnvelope(payload, "member", "execute"), "member"),
    };
  },
  async get_current_token(_input, context) {
    const payload = await requestV2exJson({
      path: "/token",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      token: requireV2exObjectResult(unwrapV2exEnvelope(payload, "token", "execute"), "token"),
    };
  },
  async create_token(input, context) {
    const payload = await requestV2exJson({
      path: "/tokens",
      method: "POST",
      apiKey: context.apiKey,
      body: { scope: input.scope, expiration: input.expiration },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const token = requireV2exObjectResult(unwrapV2exEnvelope(payload, "token creation", "execute"), "token creation");
    const tokenValue = optionalString(token.token);
    if (!tokenValue) {
      throw new ProviderRequestError(502, "V2EX token creation response missing token");
    }
    return { token: tokenValue };
  },
  async get_node(input, context) {
    const payload = await requestV2exJson({
      path: `/nodes/${encodeURIComponent(String(input.node_name))}`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { node: requireV2exObjectResult(unwrapV2exEnvelope(payload, "node", "execute"), "node") };
  },
  async list_node_topics(input, context) {
    const payload = await requestV2exJson({
      path: `/nodes/${encodeURIComponent(String(input.node_name))}/topics`,
      method: "GET",
      apiKey: context.apiKey,
      query: { p: input.p },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { topics: requireV2exArrayResult(unwrapV2exEnvelope(payload, "topics", "execute"), "topics") };
  },
  async get_topic(input, context) {
    const payload = await requestV2exJson({
      path: `/topics/${input.topic_id}`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { topic: requireV2exObjectResult(unwrapV2exEnvelope(payload, "topic", "execute"), "topic") };
  },
  async list_topic_replies(input, context) {
    const payload = await requestV2exJson({
      path: `/topics/${input.topic_id}/replies`,
      method: "GET",
      apiKey: context.apiKey,
      query: { p: input.p },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { replies: requireV2exArrayResult(unwrapV2exEnvelope(payload, "replies", "execute"), "replies") };
  },
  async set_topic_sticky(input, context) {
    const payload = await requestV2exJson({
      path: `/topics/${input.topic_id}/set-sticky`,
      method: "POST",
      apiKey: context.apiKey,
      query: { duration: input.duration },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    ensureV2exAccepted(payload, "topic sticky");
    return { success: true };
  },
  async boost_topic(input, context) {
    const payload = await requestV2exJson({
      path: `/topics/${input.topic_id}/boost`,
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    ensureV2exAccepted(payload, "topic boost");
    return { success: true };
  },
};

export async function validateV2exCredential(
  apiKey: string,
  fetcher: ProviderFetch,
): Promise<CredentialValidationResult> {
  const payload = await requestV2exJson({
    path: "/member",
    method: "GET",
    apiKey,
    fetcher,
    phase: "validate",
  });
  const member = requireV2exObjectResult(unwrapV2exEnvelope(payload, "member", "validate"), "member");
  const username = optionalString(member.username);
  const accountId = member.id === undefined ? undefined : String(member.id);

  return {
    profile: {
      accountId: accountId ? `v2ex:${accountId}` : "v2ex-member",
      displayName: username ? `V2EX ${username}` : "V2EX Member",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: v2exApiBaseUrl,
      validationEndpoint: "/member",
      memberId: accountId,
      username,
    },
  };
}

async function requestV2exLegacyArray(input: {
  path: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}): Promise<unknown[]> {
  const payload = await requestV2exLegacyJson(input);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `V2EX legacy ${input.path} response must be an array`);
  }
  return payload;
}

async function requestV2exLegacyJson(input: {
  path: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, v2exRequestTimeoutMs);
  const url = new URL(`${v2exLegacyApiBaseUrl}${input.path}`);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal: timeout.signal,
    });
    payload = await readV2exPayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `V2EX legacy ${input.path} request timed out after ${Math.ceil(v2exRequestTimeoutMs / 1000)} seconds`,
      );
    }
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `V2EX legacy request failed: ${error.message}` : "V2EX legacy request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw mapV2exError(response.status, extractV2exErrorMessage(payload), "execute", { authAware: false });
  }
  return payload;
}

async function requestV2exJson(input: {
  path: string;
  method: "DELETE" | "GET" | "POST";
  apiKey: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: V2exRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, v2exRequestTimeoutMs);
  const url = buildV2exUrl(input.path, input.query);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: buildV2exHeaders(input.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    payload = await readV2exPayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `V2EX ${input.path} request timed out after ${Math.ceil(v2exRequestTimeoutMs / 1000)} seconds`,
      );
    }
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `V2EX request failed: ${error.message}` : "V2EX request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw mapV2exError(response.status, extractV2exErrorMessage(payload), input.phase);
  }
  return payload;
}

function buildV2exUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(`${v2exApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

function buildV2exHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) headers["content-type"] = "application/json";
  return headers;
}

async function readV2exPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function unwrapV2exEnvelope(
  payload: unknown,
  label: string,
  phase: V2exRequestPhase,
): { message: string | undefined; result: unknown } {
  const envelope = requireObject(payload, `V2EX ${label} response`);
  if (envelope.success === false) {
    throw mapV2exSuccessError(extractV2exErrorMessage(envelope), phase);
  }
  if (!("result" in envelope)) {
    throw new ProviderRequestError(502, `V2EX ${label} response missing result`);
  }
  return { message: optionalString(envelope.message), result: envelope.result };
}

function ensureV2exAccepted(payload: unknown, label: string): void {
  if (payload == null) return;
  const envelope = requireObject(payload, `V2EX ${label} response`);
  if (envelope.success === false) {
    throw mapV2exSuccessError(extractV2exErrorMessage(envelope), "execute");
  }
  if (envelope.success === true) return;
  throw new ProviderRequestError(502, `V2EX ${label} response missing success=true`);
}

function requireV2exObjectResult(envelope: { result: unknown }, label: string): Record<string, unknown> {
  return requireObject(envelope.result, `V2EX ${label} result`);
}

function requireV2exArrayResult(envelope: { result: unknown }, label: string): unknown[] {
  if (!Array.isArray(envelope.result)) {
    throw new ProviderRequestError(502, `V2EX ${label} result must be an array`);
  }
  return envelope.result;
}

function parseV2exTotal(message: string | undefined, result: unknown): number {
  if (message) {
    const slashIndex = message.indexOf("/");
    if (slashIndex >= 0) {
      const parsed = Number.parseInt(message.slice(slashIndex + 1), 10);
      if (Number.isInteger(parsed) && parsed >= 0) return parsed;
    }
  }
  return Array.isArray(result) ? result.length : 0;
}

function extractV2exErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) return message;
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      const error = optionalRecord(item);
      const detail = optionalString(error?.detail) ?? optionalString(error?.message);
      if (detail) return detail;
    }
  }
  return undefined;
}

function mapV2exError(
  status: number,
  message: string | undefined,
  phase: V2exRequestPhase,
  options?: { authAware?: boolean },
): ProviderRequestError {
  const resolvedMessage = message || "V2EX request failed";
  const authAware = options?.authAware ?? true;
  if (status === 429) return new ProviderRequestError(429, resolvedMessage);
  if (phase === "validate" && (status === 401 || status === 403)) return new ProviderRequestError(400, resolvedMessage);
  if (authAware && phase === "execute" && status === 401) return new ProviderRequestError(401, resolvedMessage);
  if (phase === "execute" && status === 403) return new ProviderRequestError(403, resolvedMessage);
  return new ProviderRequestError(status || 500, resolvedMessage);
}

function mapV2exSuccessError(message: string | undefined, phase: V2exRequestPhase): ProviderRequestError {
  const resolvedMessage = message || "V2EX request failed";
  if (phase === "validate") return new ProviderRequestError(400, resolvedMessage);
  return new ProviderRequestError(502, resolvedMessage);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`);
  return record;
}
