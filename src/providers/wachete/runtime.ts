import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const wacheteApiBaseUrl = "https://api.wachete.com";

const wacheteLoginPath = "/thirdparty/v1/user/apilogin";

type WacheteRequestPhase = "validate" | "execute";
type WacheteActionHandler = (input: Record<string, unknown>, context: WacheteContext) => Promise<unknown>;

export interface WacheteContext {
  readonly apiKey: string;
  readonly userId: string;
  readonly fetcher: ProviderFetch;
  readonly signal?: AbortSignal;
}

export const wacheteActionHandlers: ProviderActionHandlers<"wachete", WacheteActionHandler> = {
  async create_or_update_monitor(input, context) {
    const payload = await requestWacheteJson({
      context,
      path: "/thirdparty/v1/task",
      method: "PUT",
      body: input,
    });
    return { monitor: requireObjectPayload(payload, "monitor") };
  },
  async get_monitor(input, context) {
    const id = requireWacheteString(input.id, "id");
    const payload = await requestWacheteJson({
      context,
      path: `/thirdparty/v1/task/${encodeURIComponent(id)}`,
      method: "GET",
    });
    return { monitor: requireObjectPayload(payload, "monitor") };
  },
  async delete_monitor(input, context) {
    const id = requireWacheteString(input.id, "id");
    await requestWacheteJson({
      context,
      path: `/thirdparty/v1/task/${encodeURIComponent(id)}`,
      method: "DELETE",
    });
    return { deleted: true, id };
  },
  async list_folder_content(input, context) {
    const payload = requireObjectPayload(
      await requestWacheteJson({
        context,
        path: "/thirdparty/v1/folder/list",
        method: "GET",
        query: compactObject({
          parentId: optionalString(input.parentId),
          continuationToken: optionalString(input.continuationToken),
        }),
      }),
      "folder content",
    );
    return {
      subfolders: readObjectArray(payload.subfolders, "subfolders"),
      monitors: readObjectArray(payload.tasks, "tasks"),
      path: readObjectArray(payload.path, "path"),
      continuationToken: optionalString(payload.continuationToken) ?? null,
    };
  },
  async get_monitor_history(input, context) {
    const id = requireWacheteString(input.id, "id");
    const payload = requireObjectPayload(
      await requestWacheteJson({
        context,
        path: `/thirdparty/v1/data/list/${encodeURIComponent(id)}`,
        method: "GET",
        query: compactObject({
          from: optionalString(input.from),
          to: optionalString(input.to),
          count: optionalNumber(input.count),
          returnDiff: optionalBoolean(input.returnDiff),
          continuationToken: optionalString(input.continuationToken),
        }),
      }),
      "history",
    );
    return {
      history: readObjectArray(payload.data, "data"),
      continuationToken: optionalString(payload.continuationToken) ?? null,
    };
  },
  async list_notifications(input, context) {
    const payload = requireObjectPayload(
      await requestWacheteJson({
        context,
        path: "/thirdparty/v1/notification/list",
        method: "GET",
        query: compactObject({
          taskId: optionalString(input.taskId),
          from: optionalString(input.from),
          to: optionalString(input.to),
          count: optionalNumber(input.count),
          html: optionalBoolean(input.html),
          continuationToken: optionalString(input.continuationToken),
        }),
      }),
      "notifications",
    );
    return {
      notifications: readObjectArray(payload.data, "data"),
      continuationToken: optionalString(payload.continuationToken) ?? null,
    };
  },
};

export async function validateWacheteCredential(
  apiKey: string,
  userIdInput: unknown,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const userId = requireWacheteString(userIdInput, "userId");
  await requestWacheteToken({
    apiKey,
    userId,
    fetcher,
    signal,
    phase: "validate",
  });
  return {
    profile: {
      accountId: `wachete:${userId}`,
      displayName: "Wachete Account",
    },
    grantedScopes: [],
    metadata: { userId },
  };
}

export async function requestWacheteToken(input: {
  apiKey: string;
  userId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: WacheteRequestPhase;
}): Promise<string> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(buildWacheteUrl(wacheteLoginPath), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({ userId: input.userId, apiKey: input.apiKey }),
      signal: timeout.signal,
    });
    const payload = await readWachetePayload(response);
    if (!response.ok) {
      throw createWacheteError(response.status, payload, input.phase);
    }
    const token = optionalString(optionalRecord(payload)?.token);
    if (!token) {
      throw new ProviderRequestError(502, "Wachete login response did not include a token", payload);
    }
    return token;
  } catch (error) {
    throw normalizeWacheteRequestError(error, timeout, "Wachete login request");
  } finally {
    timeout.cleanup();
  }
}

export function resolveWacheteUserId(input: {
  values?: Record<string, string>;
  metadata?: Record<string, unknown>;
}): string {
  return requireWacheteString(input.metadata?.userId ?? input.values?.userId, "userId");
}

async function requestWacheteJson(input: {
  context: WacheteContext;
  path: string;
  method: "GET" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}): Promise<unknown> {
  const token = await requestWacheteToken({
    apiKey: input.context.apiKey,
    userId: input.context.userId,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });
  const timeout = createProviderTimeout(input.context.signal);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = {
    method: input.method,
    headers,
    signal: timeout.signal,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  try {
    const response = await input.context.fetcher(buildWacheteUrl(input.path, input.query), init);
    const payload = await readWachetePayload(response);
    if (!response.ok) {
      throw createWacheteError(response.status, payload, "execute");
    }
    return payload;
  } catch (error) {
    throw normalizeWacheteRequestError(error, timeout, "Wachete API request");
  } finally {
    timeout.cleanup();
  }
}

function buildWacheteUrl(path: string, query: Record<string, string | number | boolean | undefined> = {}): URL {
  const url = new URL(path, wacheteApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readWachetePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Wachete returned malformed JSON");
  }
}

function createWacheteError(status: number, payload: unknown, phase: WacheteRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ?? optionalString(record?.error) ?? `Wachete request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : 500, message, payload);
}

function normalizeWacheteRequestError(
  error: unknown,
  timeout: { didTimeout(): boolean },
  label: string,
): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (timeout.didTimeout() || isAbortLikeError(error)) {
    return new ProviderRequestError(504, `${label} timed out`);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `${label} failed: ${error.message}` : `${label} failed`,
  );
}

function requireWacheteString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  return requiredRecord(payload, label, () => new ProviderRequestError(502, `Wachete returned invalid ${label} data`));
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (value == null) {
    return [];
  }
  return objectArray(
    value,
    fieldName,
    () => new ProviderRequestError(502, `Wachete response field ${fieldName} was not an array`),
  );
}
