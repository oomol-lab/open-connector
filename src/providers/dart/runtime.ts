import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const dartApiBaseUrl = "https://app.dartai.com/api/v0/public";

type DartRequestPhase = "validate" | "execute";

const listTaskQueryKeys = [
  "title",
  "ids",
  "dartboard",
  "dartboard_id",
  "status",
  "status_id",
  "assignee",
  "assignee_id",
  "reviewer",
  "reviewer_id",
  "tag",
  "tag_id",
  "priority",
  "type",
  "type_id",
  "parent_id",
  "is_completed",
  "in_trash",
  "start_at_after",
  "start_at_before",
  "due_at_after",
  "due_at_before",
  "created_at_after",
  "created_at_before",
  "updated_at_after",
  "updated_at_before",
  "no_defaults",
  "o",
  "limit",
  "offset",
];

export const dartActionHandlers: ProviderActionHandlers<"dart", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_config(_input, context) {
    return requestDart({ path: "/config", method: "GET", context, phase: "execute" });
  },
  list_tasks(input, context) {
    return requestDart({
      path: "/tasks/list",
      method: "GET",
      query: buildListTaskQuery(input),
      context,
      phase: "execute",
    });
  },
  get_task(input, context) {
    return requestDart({
      path: `/tasks/${encodeURIComponent(String(input.id))}`,
      method: "GET",
      context,
      phase: "execute",
    });
  },
  create_task(input, context) {
    return requestDart({
      path: "/tasks",
      method: "POST",
      body: input,
      context,
      phase: "execute",
    });
  },
  update_task(input, context) {
    const item = requiredRecord(input.item, "item", (message) => new ProviderRequestError(400, message));
    return requestDart({
      path: `/tasks/${encodeURIComponent(String(item.id))}`,
      method: "PUT",
      body: input,
      context,
      phase: "execute",
    });
  },
  delete_task(input, context) {
    return requestDart({
      path: `/tasks/${encodeURIComponent(String(input.id))}`,
      method: "DELETE",
      context,
      phase: "execute",
    });
  },
};

export async function validateDartCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestDart({
    path: "/me",
    method: "GET",
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Dart returned invalid authentication data");
  }
  const user = optionalRecord(record.user);
  if (record.isLoggedIn !== true) {
    throw new ProviderRequestError(400, "Dart token is not authenticated");
  }
  if (!user) {
    throw new ProviderRequestError(502, "Dart returned invalid authentication data");
  }

  const name = optionalString(user.name);
  const email = optionalString(user.email);
  const userId = optionalString(user.id);
  if (!name || !email || !userId) {
    throw new ProviderRequestError(502, "Dart returned incomplete authentication data");
  }
  return {
    profile: {
      accountId: userId,
      displayName: name,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      userId,
      email,
    },
  };
}

function buildListTaskQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of listTaskQueryKeys) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    query[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return query;
}

async function requestDart(input: {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: DartRequestPhase;
  query?: Record<string, string>;
  body?: unknown;
}): Promise<unknown> {
  const url = new URL(`${dartApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(name, value);
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.context.apiKey}`,
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = { method: input.method, headers };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  input.context.signal?.throwIfAborted();
  const timeout = createProviderTimeout(input.context.signal);
  init.signal = timeout.signal;
  try {
    const response = await input.context.fetcher(url, init);
    const payload = await readDartPayload(response);
    if (!response.ok) {
      throw createDartError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Dart request timed out");
    }
    if (isAbortSignalError(input.context.signal, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dart request failed: ${error.message}` : "Dart request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readDartPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Dart returned invalid JSON",
  });
}

function createDartError(status: number, payload: unknown, phase: DartRequestPhase): ProviderRequestError {
  const message = readDartErrorMessage(payload) ?? `Dart request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readDartErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.detail) ?? optionalString(record.message) ?? optionalString(record.error);
}
