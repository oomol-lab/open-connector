import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "reply_io";
const replyIoApiBaseUrl = "https://api.reply.io";

type ReplyIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const replyIoActionHandlers: ProviderActionHandlers<"reply_io", ReplyIoActionHandler> = {
  async get_current_user(_input, context) {
    return { user: await requestReplyIo(context, { method: "GET", path: "/v3/whoami" }) };
  },
  async list_contacts(input, context) {
    const payload = await requestReplyIo(context, { method: "GET", url: createReplyIoUrl("/v3/contacts", input) });
    return { contacts: readArray(payload, "items"), hasMore: readHasMore(payload) };
  },
  async create_contact(input, context) {
    if (!hasContactIdentity(input)) {
      throw new ProviderRequestError(
        400,
        "reply_io create_contact requires email, linkedInProfile, linkedInSalesNavigator, or linkedInRecruiter",
      );
    }
    return { contact: await requestReplyIo(context, { method: "POST", path: "/v3/contacts", body: buildBody(input) }) };
  },
  async get_contact(input, context) {
    return { contact: await requestReplyIo(context, { method: "GET", path: `/v3/contacts/${input.id}` }) };
  },
  async update_contact(input, context) {
    const { id, ...body } = input;
    return {
      contact: await requestReplyIo(context, { method: "PATCH", path: `/v3/contacts/${id}`, body: buildBody(body) }),
    };
  },
  async list_sequences(input, context) {
    const payload = await requestReplyIo(context, { method: "GET", url: createReplyIoUrl("/v3/sequences", input) });
    return { sequences: readArray(payload, "items"), hasMore: readHasMore(payload) };
  },
  async get_sequence(input, context) {
    return { sequence: await requestReplyIo(context, { method: "GET", path: `/v3/sequences/${input.id}` }) };
  },
  async start_sequence(input, context) {
    return { sequence: await requestReplyIo(context, { method: "POST", path: `/v3/sequences/${input.id}/start` }) };
  },
  async pause_sequence(input, context) {
    return { sequence: await requestReplyIo(context, { method: "POST", path: `/v3/sequences/${input.id}/pause` }) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, replyIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateReplyIoCredential(input.apiKey, fetcher, signal);
  },
};

async function validateReplyIoCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await requestReplyIo({ apiKey, fetcher, signal }, { method: "GET", path: "/v3/whoami" });
  const userId = optionalInteger(user.userId);
  const username = optionalString(user.username);

  return {
    profile: {
      accountId:
        userId === undefined
          ? `reply_io:key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`
          : `reply_io:user:${userId}`,
      displayName: username ?? (userId === undefined ? "Reply.io API Key" : `Reply.io ${userId}`),
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: replyIoApiBaseUrl,
      validationEndpoint: "/v3/whoami",
      userId,
      username,
    }),
  };
}

function createReplyIoUrl(path: string, query: Record<string, unknown> = {}): URL {
  const url = new URL(path, replyIoApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestReplyIo(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  request: {
    method: string;
    path?: string;
    url?: URL;
    body?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const url = request.url ?? createReplyIoUrl(request.path ?? "/");
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Reply.io request failed: ${error.message}` : "Reply.io request failed",
    );
  }

  const payload = await readReplyIoPayload(response);
  if (!response.ok) {
    throw mapReplyIoError(response.status, payload);
  }
  return payload;
}

async function readReplyIoPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return optionalRecord(parsed) ?? { detail: text };
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Reply.io returned malformed JSON");
    }
    return { detail: text };
  }
}

function mapReplyIoError(status: number, payload: Record<string, unknown>): ProviderRequestError {
  const message = readReplyIoErrorMessage(payload) ?? `Reply.io request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : 400, message, payload);
}

function readReplyIoErrorMessage(payload: Record<string, unknown>): string | undefined {
  const errors = payload.errors;
  if (Array.isArray(errors)) {
    const details = errors
      .map((item) => optionalRecord(item))
      .map((item) => optionalString(item?.detail))
      .filter((item): item is string => item !== undefined);
    if (details.length > 0) {
      return details.join("; ");
    }
  }

  return (
    optionalString(payload.detail) ??
    optionalString(payload.title) ??
    optionalString(payload.message) ??
    optionalString(payload.error)
  );
}

function readArray(payload: Record<string, unknown>, key: string): unknown[] {
  const value = payload[key];
  if (Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `Reply.io response is missing ${key} array`, payload);
}

function readHasMore(payload: Record<string, unknown>): boolean {
  return typeof payload.hasMore === "boolean" ? payload.hasMore : false;
}

function hasContactIdentity(input: Record<string, unknown>): boolean {
  return Boolean(
    optionalString(input.email) ??
    optionalString(input.linkedInProfile) ??
    optionalString(input.linkedInSalesNavigator) ??
    optionalString(input.linkedInRecruiter),
  );
}

function buildBody(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      if (value === undefined) {
        return [];
      }
      if (typeof value === "string") {
        return [[key, value.trim()]];
      }
      return [[key, value]];
    }),
  );
}
