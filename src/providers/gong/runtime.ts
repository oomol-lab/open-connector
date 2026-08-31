import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

export const gongDefaultApiBaseUrl = "https://api.gong.io";

const gongDefaultTimeoutMs = 30_000;
const gongCredentialHelpUrl = "https://help.gong.io/docs/receive-access-to-the-api";

type GongRequestPhase = "validate" | "execute";
type GongHttpMethod = "GET" | "POST";
type GongQueryValue = string | number | boolean | undefined;
type GongActionHandler = (input: Record<string, unknown>, context: GongContext) => Promise<unknown>;

export interface GongContext {
  apiBaseUrl: string;
  accessKey: string;
  accessKeySecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const gongActionHandlers: ProviderActionHandlers<"gong", GongActionHandler> = {
  list_users(input, context) {
    return requestGongJson({
      context,
      path: "/v2/users",
      method: "GET",
      query: compactObject({
        cursor: optionalString(input.cursor),
        includeAvatars: typeof input.includeAvatars === "boolean" ? input.includeAvatars : undefined,
      }),
      phase: "execute",
    });
  },
  get_user(input, context) {
    return requestGongJson({
      context,
      path: `/v2/users/${encodeURIComponent(requireInputString(input.userId, "userId"))}`,
      method: "GET",
      phase: "execute",
    });
  },
  list_calls(input, context) {
    return requestGongJson({
      context,
      path: "/v2/calls",
      method: "GET",
      query: compactObject({
        fromDateTime: optionalString(input.fromDateTime),
        toDateTime: optionalString(input.toDateTime),
        cursor: optionalString(input.cursor),
        workspaceId: optionalString(input.workspaceId),
      }),
      phase: "execute",
    });
  },
  get_call(input, context) {
    return requestGongJson({
      context,
      path: `/v2/calls/${encodeURIComponent(requireInputString(input.callId, "callId"))}`,
      method: "GET",
      phase: "execute",
    });
  },
  get_call_transcripts(input, context) {
    return requestGongJson({
      context,
      path: "/v2/calls/transcript",
      method: "POST",
      body: compactObject({
        cursor: optionalString(input.cursor),
        filter: compactObject({
          fromDateTime: input.fromDateTime,
          toDateTime: input.toDateTime,
          callIds: input.callIds,
        }),
      }),
      phase: "execute",
    });
  },
  list_call_outcomes(_input, context) {
    return requestGongJson({
      context,
      path: "/v2/call-outcomes",
      method: "GET",
      phase: "execute",
    });
  },
};

export function resolveGongCredentialContext(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): GongContext {
  return {
    apiBaseUrl: normalizeGongApiBaseUrl(input.apiBaseUrl || gongDefaultApiBaseUrl),
    accessKey: requiredInputString(input.accessKey, "accessKey"),
    accessKeySecret: requiredInputString(input.accessKeySecret, "accessKeySecret"),
    fetcher,
    signal,
  };
}

export async function validateGongCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = resolveGongCredentialContext(input, fetcher, signal);
  const payload = await requestGongJson({
    context,
    path: "/v2/users",
    method: "GET",
    query: { includeAvatars: false },
    phase: "validate",
  });
  const usersValue = asRecord(payload).users;
  if (!Array.isArray(usersValue)) {
    throw new ProviderRequestError(502, "Gong /v2/users response must include users array");
  }
  const firstUser = optionalRecord(usersValue[0]);
  const firstUserId = optionalString(firstUser?.id);
  const firstUserEmail = optionalString(firstUser?.emailAddress);

  return {
    profile: {
      accountId: buildProviderAccountId(context.apiBaseUrl, context.accessKey),
      displayName: firstUserEmail ?? "Gong API",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: context.apiBaseUrl,
      validationEndpoint: "/v2/users",
      credentialHelpUrl: gongCredentialHelpUrl,
      validationUserId: firstUserId,
      validationUserEmail: firstUserEmail,
    }),
  };
}

async function requestGongJson(input: {
  context: GongContext;
  path: string;
  method: GongHttpMethod;
  query?: Record<string, GongQueryValue>;
  body?: Record<string, unknown>;
  phase: GongRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, gongDefaultTimeoutMs);
  try {
    const response = await input.context.fetcher(buildGongUrl(input.context.apiBaseUrl, input.path, input.query), {
      method: input.method,
      headers: buildGongHeaders(input.context, input.body != null),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readGongPayload(response);
    if (!response.ok) {
      throw mapGongHttpError(response.status, readGongErrorMessage(payload), input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Gong ${input.path} request timed out after ${gongDefaultTimeoutMs / 1000} seconds`,
      );
    }

    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Gong ${input.path} request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

/** Normalize a public HTTPS Gong API tenant URL. */
export function normalizeGongApiBaseUrl(value: string): string {
  const candidate = value.trim() || gongDefaultApiBaseUrl;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }

  assertPublicHttpUrl(url.toString(), {
    fieldName: "apiBaseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  url.search = "";
  url.hash = "";
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function buildGongUrl(baseUrl: string, path: string, query?: Record<string, GongQueryValue>): string {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildGongHeaders(
  context: Pick<GongContext, "accessKey" | "accessKeySecret">,
  hasBody: boolean,
): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${context.accessKey}:${context.accessKeySecret}`).toString("base64")}`,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readGongPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { errors: [text] };
  }
}

function readGongErrorMessage(payload: unknown): string {
  const record = optionalRecord(payload);
  const errors = record?.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") {
      return first;
    }
  }
  const message = optionalString(record?.message) ?? optionalString(record?.error);
  return message || "Gong request failed";
}

function mapGongHttpError(status: number, message: string, phase: GongRequestPhase): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && [400, 401, 403].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  if ([400, 404].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  if ([401, 403].includes(status)) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
}

function buildProviderAccountId(apiBaseUrl: string, accessKey: string): string {
  const host = new URL(apiBaseUrl).hostname;
  const accessKeyHash = createHash("sha256").update(accessKey).digest("hex").slice(0, 16);
  return `gong:${host}:${accessKeyHash}`;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredInputString(optionalString(value), fieldName);
}

function asRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Gong response must be a JSON object");
  }
  return record;
}
