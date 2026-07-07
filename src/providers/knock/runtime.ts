import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { KnockActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const knockApiBaseUrl = "https://api.knock.app/v1";

const requestTimeoutMs = 30_000;

type KnockRequestMode = "validate" | "execute";
type KnockActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ValidateKnockCredentialInput {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const knockActionHandlers: Record<KnockActionName, KnockActionHandler> = {
  async list_users(input, context) {
    const payload = await requestKnockJson(
      {
        method: "GET",
        path: "/users",
        query: compactObject({
          after: optionalString(input.after),
          before: optionalString(input.before),
          page_size: typeof input.pageSize === "number" ? String(input.pageSize) : undefined,
          "include[]": optionalStringArray(input.include),
        }),
      },
      context,
      "execute",
    );

    return normalizeUserListResponse(payload);
  },
  async get_user(input, context) {
    const userId = requiredString(input.userId, "userId", invalidInputError);
    const payload = await requestKnockJson(
      {
        method: "GET",
        path: `/users/${encodePathSegment(userId)}`,
      },
      context,
      "execute",
    );

    return { user: normalizeUser(payload) };
  },
  async identify_user(input, context) {
    const userId = requiredString(input.userId, "userId", invalidInputError);
    const payload = await requestKnockJson(
      {
        method: "PUT",
        path: `/users/${encodePathSegment(userId)}`,
        body: buildIdentifyUserBody(input),
      },
      context,
      "execute",
    );

    return { user: normalizeUser(payload) };
  },
  async delete_user(input, context) {
    const userId = requiredString(input.userId, "userId", invalidInputError);
    await requestKnockJson(
      {
        method: "DELETE",
        path: `/users/${encodePathSegment(userId)}`,
      },
      context,
      "execute",
    );

    return {
      success: true,
      userId,
    };
  },
  async trigger_workflow(input, context) {
    const key = requiredString(input.key, "key", invalidInputError);
    const payload = await requestKnockJson(
      {
        method: "POST",
        path: `/workflows/${encodePathSegment(key)}/trigger`,
        body: buildTriggerWorkflowBody(input),
        idempotencyKey: optionalString(input.idempotencyKey),
      },
      context,
      "execute",
    );
    const record = requireProviderRecord(payload, "Knock workflow trigger response is invalid");
    const workflowRunId = optionalString(record.workflow_run_id);
    if (!workflowRunId) {
      throw new ProviderRequestError(502, "Knock workflow trigger response is missing workflow_run_id", record);
    }

    return {
      workflowRunId,
      raw: record,
    };
  },
};

export async function validateKnockCredential(
  input: ValidateKnockCredentialInput,
): Promise<CredentialValidationResult> {
  await requestKnockJson(
    {
      method: "GET",
      path: "/users",
      query: {
        page_size: "1",
      },
    },
    {
      apiKey: input.apiKey,
      fetcher: input.fetcher,
      signal: input.signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "knock",
      displayName: "Knock API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: knockApiBaseUrl,
      validationEndpoint: "/users",
    },
  };
}

async function requestKnockJson(
  request: {
    method: "GET" | "PUT" | "POST" | "DELETE";
    path: string;
    query?: Record<string, string | string[] | undefined>;
    body?: Record<string, unknown>;
    idempotencyKey?: string;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  mode: KnockRequestMode,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);

  try {
    const headers = knockHeaders(context.apiKey);
    if (request.idempotencyKey) {
      headers["Idempotency-Key"] = request.idempotencyKey;
    }

    const response = await context.fetcher(buildKnockUrl(request.path, request.query), {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: timeout.signal,
    });
    const payload = await readKnockPayload(response);

    if (!response.ok) {
      throw createKnockError(response.status, payload, mode);
    }

    if (response.status === 204) {
      return null;
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Knock request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Knock request failed: ${error.message}` : "Knock request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildKnockUrl(path: string, query: Record<string, string | string[] | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${knockApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url;
}

function knockHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readKnockPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Knock returned invalid JSON");
  }
}

function createKnockError(status: number, payload: unknown, mode: KnockRequestMode): ProviderRequestError {
  const message = extractKnockErrorMessage(payload) ?? `Knock request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (mode === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (mode === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (mode === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractKnockErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message);
  if (directMessage) {
    return directMessage;
  }

  const error = record.error;
  return optionalString(error) ?? optionalString(optionalRecord(error)?.message);
}

function normalizeUserListResponse(payload: unknown): Record<string, unknown> {
  const record = requireProviderRecord(payload, "Knock users list response is invalid");
  return {
    users: Array.isArray(record.entries) ? record.entries.map((entry) => normalizeUser(entry)) : [],
    pageInfo: normalizePageInfo(record.page_info),
  };
}

function normalizeUser(payload: unknown): Record<string, unknown> {
  const record = requireProviderRecord(payload, "Knock user response is invalid");
  return {
    id: optionalString(record.id) ?? "",
    email: optionalString(record.email) ?? null,
    name: optionalString(record.name) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    updatedAt: optionalString(record.updated_at) ?? null,
    raw: record,
  };
}

function normalizePageInfo(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    after: optionalString(record.after) ?? null,
    before: optionalString(record.before) ?? null,
    pageSize: typeof record.page_size === "number" ? record.page_size : null,
    raw: record,
  };
}

function buildIdentifyUserBody(input: Record<string, unknown>): Record<string, unknown> {
  const properties = optionalRecord(input.properties) ?? {};
  return compactObject({
    ...properties,
    email: optionalString(input.email),
    name: optionalString(input.name),
    timezone: optionalString(input.timezone),
    avatar: optionalString(input.avatar),
    phone_number: optionalString(input.phoneNumber),
    channel_data: optionalRecord(input.channelData),
    preferences: optionalRecord(input.preferences),
  });
}

function buildTriggerWorkflowBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    recipients: input.recipients,
    data: optionalRecord(input.data),
    actor: input.actor,
    tenant: input.tenant,
    cancellation_key: optionalString(input.cancellationKey),
    settings: optionalRecord(input.settings),
  });
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.map((entry) => optionalString(entry)).filter((entry): entry is string => entry !== undefined);
  return values.length > 0 ? values : undefined;
}

function requireProviderRecord(value: unknown, message: string): Record<string, unknown> {
  return requiredRecord(value, message, (errorMessage) => new ProviderRequestError(502, errorMessage));
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
