import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const workastApiBaseUrl = "https://api.todobot.io";

const taskWriteKeys = ["text", "description", "startDate", "dueDate", "dueDateTimezone", "dueDateTime"] as const;

type WorkastRequestPhase = "validate" | "execute";
type WorkastQueryValue = string | number | boolean | undefined;

interface WorkastRequestOptions {
  apiKey: string;
  readonly method: "GET" | "POST" | "PATCH";
  readonly path: string;
  fetcher: ApiKeyProviderContext["fetcher"];
  signal?: AbortSignal;
  readonly phase: WorkastRequestPhase;
  readonly query?: Readonly<Record<string, WorkastQueryValue>>;
  readonly body?: Readonly<Record<string, unknown>>;
}

export const workastActionHandlers: ProviderActionHandlers<"workast", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_my_details(_input, context) {
    const user = await requestWorkastJson({
      apiKey: context.apiKey,
      method: "GET",
      path: "/user/me",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { user: requireObjectPayload(user, "user") };
  },
  async search_spaces(input, context) {
    const payload = await requestWorkastJson({
      apiKey: context.apiKey,
      method: "GET",
      path: "/list",
      query: compactObject({
        onlyUserLists: optionalBoolean(input.onlyUserLists),
        statusIs: optionalString(input.statusIs),
        includeTemplates: optionalBoolean(input.includeTemplates),
        type: optionalString(input.type),
        name: optionalString(input.name),
        limit: optionalInteger(input.limit),
        skip: optionalInteger(input.skip),
        sort: optionalString(input.sort),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { spaces: requireArrayPayload(payload, "spaces") };
  },
  async get_space_details(input, context) {
    const spaceId = requireString(input.spaceId, "spaceId");
    const space = await requestWorkastJson({
      apiKey: context.apiKey,
      method: "GET",
      path: `/list/${encodeURIComponent(spaceId)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { space: requireObjectPayload(space, "space") };
  },
  async get_space_tasks(input, context) {
    const spaceId = requireString(input.spaceId, "spaceId");
    const payload = await requestWorkastJson({
      apiKey: context.apiKey,
      method: "GET",
      path: `/list/${encodeURIComponent(spaceId)}/task`,
      query: compactObject({
        statusIs: optionalString(input.statusIs),
        skip: optionalInteger(input.skip),
        limit: optionalInteger(input.limit),
        order: optionalString(input.order),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { tasks: requireArrayPayload(payload, "tasks") };
  },
  async get_task_details(input, context) {
    return getTask(input, context, "GET", "");
  },
  async create_task(input, context) {
    const spaceId = requireString(input.spaceId, "spaceId");
    const task = await requestWorkastJson({
      apiKey: context.apiKey,
      method: "POST",
      path: `/list/${encodeURIComponent(spaceId)}/task`,
      body: compactObject({
        ...pickTaskWriteFields(input),
        assignedTo: input.assignedTo,
        listPosition: optionalInteger(input.listPosition),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { task: requireObjectPayload(task, "task") };
  },
  async update_task(input, context) {
    const taskId = requireString(input.taskId, "taskId");
    const body = compactObject(pickTaskWriteFields(input));
    if (Object.keys(body).length == 0) {
      throw providerError("invalid_input", "update_task requires at least one field to update", 400);
    }
    const task = await requestWorkastJson({
      apiKey: context.apiKey,
      method: "PATCH",
      path: `/task/${encodeURIComponent(taskId)}`,
      body,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { task: requireObjectPayload(task, "task") };
  },
  async complete_task(input, context) {
    return getTask(input, context, "POST", "/done");
  },
};

export async function validateWorkastCredential(
  apiKey: string,
  fetcher: ApiKeyProviderContext["fetcher"],
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = requireObjectPayload(
    await requestWorkastJson({
      apiKey,
      method: "GET",
      path: "/user/me",
      fetcher,
      signal,
      phase: "validate",
    }),
    "user",
  );

  return {
    profile: { displayName: readAccountLabel(user) ?? "Workast API Token" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: workastApiBaseUrl,
      validationEndpoint: "/user/me",
    },
  };
}

async function getTask(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  method: "GET" | "POST",
  suffix: string,
) {
  const taskId = requireString(input.taskId, "taskId");
  const task = await requestWorkastJson({
    apiKey: context.apiKey,
    method,
    path: `/task/${encodeURIComponent(taskId)}${suffix}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { task: requireObjectPayload(task, "task") };
}

async function requestWorkastJson(options: WorkastRequestOptions) {
  const timeout = createProviderTimeout(options.signal);
  const url = new URL(`${workastApiBaseUrl}${options.path}`);
  appendQuery(url, options.query);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${options.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  try {
    const response = await options.fetcher(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw mapWorkastError(response.status, payload, options.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw providerError("provider_error", "Workast request timed out", 504);
    }
    throw providerError(
      "provider_error",
      error instanceof Error ? `Workast request failed: ${error.message}` : "Workast request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

function providerError(_code: string, message: string, status: number): ProviderRequestError {
  return new ProviderRequestError(status, message);
}

function appendQuery(url: URL, query: Readonly<Record<string, WorkastQueryValue>> | undefined) {
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (text.trim() == "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw providerError("provider_error", "Workast returned invalid JSON", 502);
  }
}

function mapWorkastError(status: number, payload: unknown, phase: WorkastRequestPhase) {
  const message = readErrorMessage(payload) ?? `Workast API request failed with status ${status}`;
  if (status == 401 || status == 403) {
    return phase == "validate"
      ? providerError("invalid_input", message, 400)
      : providerError("credential_expired", message, 401);
  }
  if (status == 429) return providerError("rate_limited", message, 429);
  if (status == 400 || status == 404 || status == 409 || status == 422) {
    return providerError("invalid_input", message, 400);
  }
  return providerError("provider_error", message, 502);
}

function readErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function requireArrayPayload(payload: unknown, fieldName: string) {
  const candidate = Array.isArray(payload) ? payload : optionalRecord(payload)?.[fieldName];
  if (!Array.isArray(candidate)) {
    throw providerError("provider_error", `Workast returned an invalid ${fieldName} payload`, 502);
  }
  return candidate.map((item) => requireObjectPayload(item, fieldName));
}

function requireObjectPayload(payload: unknown, fieldName: string) {
  const record = optionalRecord(payload);
  const nested = optionalRecord(record?.[fieldName]);
  const candidate = nested ?? record;
  if (!candidate) {
    throw providerError("provider_error", `Workast returned an invalid ${fieldName} payload`, 502);
  }
  return candidate;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value != "string" || value.trim() == "") {
    throw providerError("invalid_input", `${fieldName} must be a non-empty string`, 400);
  }
  return value;
}

function pickTaskWriteFields(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const key of taskWriteKeys) result[key] = input[key];
  return result;
}

function readAccountLabel(user: Record<string, unknown>) {
  return (
    optionalString(user.name) ??
    optionalString(user.displayName) ??
    optionalString(user.username) ??
    optionalString(user.email)
  );
}
