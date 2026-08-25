import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "clerk";
const clerkApiBaseUrl = "https://api.clerk.com/v1";

type ClerkRequestPhase = "validate" | "execute";
type ClerkActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const clerkActionHandlers: ProviderActionHandlers<"clerk", ClerkActionHandler> = {
  async list_users(input, context) {
    const payload = await requestClerk({
      path: "/users",
      method: "GET",
      context,
      phase: "execute",
      query: buildUserFilterQuery(input, ["order_by", "limit", "offset"]),
    });
    return normalizeListUsers(payload);
  },
  count_users(input, context) {
    return requestClerk({
      path: "/users/count",
      method: "GET",
      context,
      phase: "execute",
      query: buildUserFilterQuery(input),
    });
  },
  async get_user(input, context) {
    return {
      user: await requestClerk({
        path: `/users/${encodeURIComponent(requiredInputString(input.user_id, "user_id"))}`,
        method: "GET",
        context,
        phase: "execute",
      }),
    };
  },
  async create_user(input, context) {
    return {
      user: await requestClerk({
        path: "/users",
        method: "POST",
        context,
        phase: "execute",
        body: input,
      }),
    };
  },
  async update_user(input, context) {
    const { user_id, ...body } = input;
    return {
      user: await requestClerk({
        path: `/users/${encodeURIComponent(requiredInputString(user_id, "user_id"))}`,
        method: "PATCH",
        context,
        phase: "execute",
        body,
      }),
    };
  },
  async update_user_metadata(input, context) {
    const { user_id, ...body } = input;
    return {
      user: await requestClerk({
        path: `/users/${encodeURIComponent(requiredInputString(user_id, "user_id"))}/metadata`,
        method: "PATCH",
        context,
        phase: "execute",
        body,
      }),
    };
  },
  async delete_user(input, context) {
    return {
      deleted_object: await requestClerk({
        path: `/users/${encodeURIComponent(requiredInputString(input.user_id, "user_id"))}`,
        method: "DELETE",
        context,
        phase: "execute",
      }),
    };
  },
  ban_user(input, context) {
    return runUserStateAction("ban", input, context);
  },
  unban_user(input, context) {
    return runUserStateAction("unban", input, context);
  },
  lock_user(input, context) {
    return runUserStateAction("lock", input, context);
  },
  unlock_user(input, context) {
    return runUserStateAction("unlock", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, clerkActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateClerkCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};

async function validateClerkCredential(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  const payload = await requestClerk({
    path: "/instance",
    method: "GET",
    context: { apiKey: input.apiKey, fetcher: input.fetcher, signal: input.signal },
    phase: "validate",
  });
  const instance = optionalRecord(payload);
  const instanceName = optionalString(instance?.display_name);
  const instanceId = optionalString(instance?.id);

  return {
    profile: {
      accountId: instanceId ?? "clerk-api-key",
      displayName: instanceName ? `Clerk: ${instanceName}` : "Clerk API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: clerkApiBaseUrl,
      validationEndpoint: "/instance",
    },
  };
}

async function runUserStateAction(
  action: "ban" | "unban" | "lock" | "unlock",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return {
    user: await requestClerk({
      path: `/users/${encodeURIComponent(requiredInputString(input.user_id, "user_id"))}/${action}`,
      method: "POST",
      context,
      phase: "execute",
    }),
  };
}

function buildUserFilterQuery(input: Record<string, unknown>, extraKeys: string[] = []): Array<[string, unknown]> {
  const query: Array<[string, unknown]> = [
    ["email_address", input.email_address],
    ["phone_number", input.phone_number],
    ["username", input.username],
    ["user_id", input.user_id],
    ["external_id", input.external_id],
    ["query", input.query],
  ];
  for (const key of extraKeys) {
    query.push([key, input[key]]);
  }
  return query;
}

async function requestClerk(input: {
  path: string;
  method: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: ClerkRequestPhase;
  query?: Array<[string, unknown]>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(`${clerkApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const body = input.body ? compactJson(input.body) : undefined;
  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method,
      headers: clerkHeaders(input.context.apiKey, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `clerk request failed: ${error.message}` : "clerk request failed",
    );
  }

  const payload = await readClerkPayload(response);
  if (!response.ok) {
    throw createClerkError(response, payload, input.phase);
  }
  return payload;
}

function clerkHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

function normalizeListUsers(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    return {
      users: payload,
      total_count: payload.length,
    };
  }
  const record = optionalRecord(payload);
  const data = record?.data;
  if (Array.isArray(data)) {
    return {
      users: data,
      total_count: typeof record?.total_count === "number" ? record.total_count : data.length,
    };
  }
  throw new ProviderRequestError(502, "invalid clerk list_users response", payload);
}

async function readClerkPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createClerkError(response: Response, payload: unknown, phase: ClerkRequestPhase): ProviderRequestError {
  const message =
    extractClerkErrorMessage(payload) ?? response.statusText ?? `clerk request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (phase === "execute" && (response.status === 400 || response.status === 404 || response.status === 422)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractClerkErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim().slice(0, 200);
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = optionalRecord(errors[0]);
    return (
      optionalString(firstError?.long_message) ??
      optionalString(firstError?.message) ??
      optionalString(firstError?.code)
    );
  }
  return optionalString(record.message) ?? optionalString(record.error);
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
