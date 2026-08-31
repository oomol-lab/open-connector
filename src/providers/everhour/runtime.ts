import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const everhourApiBaseUrl = "https://api.everhour.com";
const everhourValidationPath = "/users/me";

type EverhourRequestPhase = "validate" | "execute";
type EverhourMethod = "GET" | "POST" | "DELETE";
type EverhourQueryValue = string | number | boolean | undefined;
type EverhourContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type EverhourActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface EverhourRequestInput {
  method: EverhourMethod;
  path: string;
  phase: EverhourRequestPhase;
  query?: Record<string, EverhourQueryValue>;
  body?: Record<string, unknown>;
}

export const everhourActionHandlers: ProviderActionHandlers<"everhour", EverhourActionHandler> = {
  async get_current_user(_input, context) {
    return {
      user: requireEverhourObject(
        await requestEverhourJson({ method: "GET", path: "/users/me", phase: "execute" }, context),
        "current user",
      ),
    };
  },
  async list_users(_input, context) {
    return {
      users: requireEverhourArray(
        await requestEverhourJson({ method: "GET", path: "/team/users", phase: "execute" }, context),
        "users",
      ),
    };
  },
  async list_projects(input, context) {
    const payload = await requestEverhourJson(
      {
        method: "GET",
        path: "/projects",
        phase: "execute",
        query: compactObject({
          query: optionalString(input.query),
          limit: readOptionalPositiveInteger(input.limit, "limit"),
          platform: optionalString(input.platform),
        }),
      },
      context,
    );
    return { projects: requireEverhourArray(payload, "projects") };
  },
  async get_project(input, context) {
    const payload = await requestEverhourJson(
      {
        method: "GET",
        path: `/projects/${encodePathSegment(readRequiredString(input.projectId, "projectId"))}`,
        phase: "execute",
      },
      context,
    );
    return { project: requireEverhourObject(payload, "project") };
  },
  async list_project_tasks(input, context) {
    const projectId = readRequiredString(input.projectId, "projectId");
    const payload = await requestEverhourJson(
      {
        method: "GET",
        path: `/projects/${encodePathSegment(projectId)}/tasks`,
        phase: "execute",
        query: compactObject({
          page: readOptionalPositiveInteger(input.page, "page"),
          limit: readOptionalPositiveInteger(input.limit, "limit"),
          query: optionalString(input.query),
          "exclude-closed": optionalBoolean(input.excludeClosed),
        }),
      },
      context,
    );
    return { tasks: requireEverhourArray(payload, "tasks") };
  },
  async get_task(input, context) {
    const payload = await requestEverhourJson(
      {
        method: "GET",
        path: `/tasks/${encodePathSegment(readRequiredString(input.taskId, "taskId"))}`,
        phase: "execute",
      },
      context,
    );
    return { task: requireEverhourObject(payload, "task") };
  },
  async search_tasks(input, context) {
    const payload = await requestEverhourJson(
      {
        method: "GET",
        path: "/tasks/search",
        phase: "execute",
        query: compactObject({
          query: readRequiredString(input.query, "query"),
          limit: readOptionalPositiveInteger(input.limit, "limit"),
          searchInClosed: optionalBoolean(input.searchInClosed),
        }),
      },
      context,
    );
    return { tasks: requireEverhourArray(payload, "tasks") };
  },
  async list_time_records(input, context) {
    const from = optionalString(input.from);
    const to = optionalString(input.to);
    if (from && to && from > to) {
      throw new ProviderRequestError(400, "from must be on or before to");
    }
    const payload = await requestEverhourJson(
      {
        method: "GET",
        path: "/team/time",
        phase: "execute",
        query: compactObject({
          from,
          to,
          page: readOptionalPositiveInteger(input.page, "page"),
          limit: readOptionalPositiveInteger(input.limit, "limit"),
        }),
      },
      context,
    );
    return { timeRecords: requireEverhourArray(payload, "time records") };
  },
  async create_time_record(input, context) {
    const payload = await requestEverhourJson(
      {
        method: "POST",
        path: "/time",
        phase: "execute",
        body: compactObject({
          time: readRequiredPositiveInteger(input.time, "time"),
          date: readRequiredString(input.date, "date"),
          task: optionalString(input.taskId),
          user: readOptionalPositiveInteger(input.userId, "userId"),
          comment: optionalString(input.comment),
        }),
      },
      context,
    );
    return { timeRecord: requireEverhourObject(payload, "time record") };
  },
  async start_timer(input, context) {
    const payload = await requestEverhourJson(
      {
        method: "POST",
        path: "/timers",
        phase: "execute",
        body: compactObject({
          task: readRequiredString(input.taskId, "taskId"),
          userDate: optionalString(input.userDate),
          comment: optionalString(input.comment),
        }),
      },
      context,
    );
    return { timer: requireEverhourObject(payload, "timer") };
  },
  async get_current_timer(_input, context) {
    return {
      timer: requireEverhourObject(
        await requestEverhourJson({ method: "GET", path: "/timers/current", phase: "execute" }, context),
        "timer",
      ),
    };
  },
  async stop_timer(_input, context) {
    return {
      timer: requireEverhourObject(
        await requestEverhourJson({ method: "DELETE", path: "/timers/current", phase: "execute" }, context),
        "timer",
      ),
    };
  },
};

export async function validateEverhourCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = requireEverhourObject(
    await requestEverhourJson(
      {
        method: "GET",
        path: everhourValidationPath,
        phase: "validate",
      },
      { apiKey, fetcher, signal },
    ),
    "current user",
  );
  const userId = optionalInteger(user.id);
  const userName = optionalString(user.name);

  return {
    profile: {
      accountId: userId === undefined ? "api_key" : String(userId),
      displayName: userName ?? "Everhour API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: everhourApiBaseUrl,
      validationEndpoint: everhourValidationPath,
      userId,
      userName,
      userRole: optionalString(user.role),
      userStatus: optionalString(user.status),
      headline: optionalString(user.headline),
    }),
  };
}

async function requestEverhourJson(input: EverhourRequestInput, context: EverhourContext): Promise<unknown> {
  const url = new URL(input.path, everhourApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(context.signal);
  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: input.method,
      headers: {
        accept: "application/json",
        "x-api-key": context.apiKey,
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Everhour request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Everhour request failed: ${error.message}` : "Everhour request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readEverhourPayload(response);
  if (!response.ok) {
    throw buildEverhourError(response.status, payload, input.phase);
  }
  return payload;
}

async function readEverhourPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Everhour returned invalid JSON", text);
  }
}

function buildEverhourError(status: number, payload: unknown, phase: EverhourRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.details) ??
    `Everhour request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function requireEverhourObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Everhour ${label} response must be an object`, value);
  }
  return record;
}

function requireEverhourArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Everhour ${label} response must be an array`, value);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = readOptionalPositiveInteger(value, fieldName);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%3A/gi, ":");
}
