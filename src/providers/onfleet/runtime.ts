import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const onfleetApiBaseUrl = "https://onfleet.com/api/v2";

type OnfleetRequestPhase = "validate" | "execute";
export interface OnfleetActionContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
type OnfleetActionHandler = (input: Record<string, unknown>, context: OnfleetActionContext) => Promise<unknown>;

interface OnfleetRequestInput {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

export const onfleetActionHandlers: ProviderActionHandlers<"onfleet", OnfleetActionHandler> = {
  async create_task(input, context) {
    return requireObject(
      await requestOnfleetJson(context, { method: "POST", path: "/tasks", body: input }),
      "Onfleet create_task response",
    );
  },
  async list_tasks(input, context) {
    const payload = requireObject(
      await requestOnfleetJson(context, { path: "/tasks/all", query: normalizeListTasksQuery(input) }, "execute"),
      "Onfleet list_tasks response",
    );
    const tasks = requireArray(payload.tasks, "Onfleet list_tasks response missing tasks");
    const lastId = optionalString(payload.lastId)?.trim();
    return { tasks, ...(lastId ? { lastId } : {}) };
  },
  async get_task(input, context) {
    return requireObject(
      await requestOnfleetJson(context, { path: taskPath(input.taskId) }),
      "Onfleet get_task response",
    );
  },
  async update_task(input, context) {
    const { taskId, ...body } = input;
    return requireObject(
      await requestOnfleetJson(context, {
        method: "PUT",
        path: taskPath(taskId),
        body,
      }),
      "Onfleet update_task response",
    );
  },
  async clone_task(input, context) {
    return requireObject(
      await requestOnfleetJson(context, {
        method: "POST",
        path: `${taskPath(input.taskId)}/clone`,
        ...(input.options === undefined ? {} : { body: { options: input.options } }),
      }),
      "Onfleet clone_task response",
    );
  },
  async complete_task(input, context) {
    await requestOnfleetJson(context, {
      method: "POST",
      path: `${taskPath(input.taskId)}/complete`,
      body: {
        completionDetails: requireObject(input.completionDetails, "Onfleet complete_task completionDetails"),
      },
    });
    return { success: true };
  },
  async delete_task(input, context) {
    await requestOnfleetJson(context, { method: "DELETE", path: taskPath(input.taskId) });
    return { success: true };
  },
};

export async function validateOnfleetCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const normalizedApiKey = requireCredentialValue(apiKey, "apiKey");
  await requestOnfleetJson({ apiKey: normalizedApiKey, fetcher, signal }, { path: "/auth/test" }, "validate");

  return {
    profile: { accountId: "onfleet", displayName: "Onfleet Account" },
    grantedScopes: [],
    metadata: { validationEndpoint: "/auth/test" },
  };
}

export async function requestOnfleetJson(
  context: OnfleetActionContext,
  request: OnfleetRequestInput,
  phase: OnfleetRequestPhase = "execute",
): Promise<unknown> {
  const url = new URL(`${onfleetApiBaseUrl}${request.path}`);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(context.signal);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method ?? "GET",
      headers: onfleetHeaders(context.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: timeout.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? error.message : "Onfleet request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readOnfleetPayload(response);
  if (!response.ok) {
    throw createOnfleetError(response, payload, phase);
  }
  return payload;
}

function normalizeListTasksQuery(input: Record<string, unknown>) {
  return {
    from: input.from,
    to: input.to,
    lastId: input.lastId,
    state: joinArray(input.state),
    worker: input.worker,
    completeBeforeBefore: input.completeBeforeBefore,
    completeAfterAfter: input.completeAfterAfter,
    dependencies: joinArray(input.dependencies),
    containers: joinArray(input.containers),
  };
}

function joinArray(value: unknown) {
  return Array.isArray(value) ? value.join(",") : undefined;
}

function taskPath(taskId: unknown) {
  return `/tasks/${encodeURIComponent(String(taskId))}`;
}

function onfleetHeaders(apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "User-Agent": providerUserAgent,
  };
  if (hasBody) headers["Content-Type"] = "application/json";
  return headers;
}

async function readOnfleetPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createOnfleetError(response: Response, payload: unknown, phase: OnfleetRequestPhase) {
  const message =
    extractOnfleetErrorMessage(payload) ||
    response.statusText ||
    `Onfleet request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 429 || response.status >= 500) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function extractOnfleetErrorMessage(payload: unknown) {
  if (typeof payload === "string") return payload.trim();
  const object = optionalRecord(payload);
  const message = object?.message;
  if (typeof message === "string") return message.trim();
  const nestedMessage = optionalString(optionalRecord(message)?.message);
  return nestedMessage?.trim() ?? optionalString(object?.error)?.trim() ?? "";
}

function requireCredentialValue(value: string | undefined, fieldName: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function requireObject(value: unknown, label: string) {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `${label} must be an object`);
  return object;
}

function requireArray(value: unknown, message: string) {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, message);
  return value.map((item) => requireObject(item, "Onfleet task"));
}
