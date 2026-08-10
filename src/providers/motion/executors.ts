import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { MotionActionName } from "./actions.ts";

import { optionalRecord, optionalString, requiredString, stringArray } from "../../core/cast.ts";
import { jsonObject, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "motion";
const motionApiBaseUrl = "https://api.usemotion.com/v1";
const motionDefaultRequestTimeoutMs = 30_000;
const taskUpdateFieldNames = [
  "name",
  "workspaceId",
  "dueDate",
  "duration",
  "status",
  "autoScheduled",
  "projectId",
  "description",
  "priority",
  "labels",
  "assigneeId",
];

type MotionPhase = "validate" | "execute";
type MotionMethod = "GET" | "POST" | "PATCH" | "DELETE";
type MotionActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const motionActionHandlers: Record<MotionActionName, MotionActionHandler> = {
  async list_workspaces(_input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: "/workspaces",
      phase: "execute",
    });

    return {
      workspaces: readArrayPayload(payload, "workspaces", "Motion workspaces response"),
    };
  },
  async list_users(input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: "/users",
      query: queryParams({
        workspaceId: optionalString(input.workspaceId),
      }),
      phase: "execute",
    });

    return {
      users: readArrayPayload(payload, "users", "Motion users response"),
    };
  },
  async get_my_user(_input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: "/users/me",
      phase: "execute",
    });

    return {
      user: requireObject(payload, "Motion current user response"),
    };
  },
  async list_projects(input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: "/projects",
      query: queryParams({
        workspaceId: requiredInputString(input.workspaceId, "workspaceId"),
        cursor: optionalString(input.cursor),
      }),
      phase: "execute",
    });

    return {
      meta: readObjectProperty(payload, "meta", "Motion projects response"),
      projects: readArrayProperty(payload, "projects", "Motion projects response"),
    };
  },
  async get_project(input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: `/projects/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      phase: "execute",
    });

    return {
      project: requireObject(payload, "Motion project response"),
    };
  },
  async create_project(input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: "/projects",
      method: "POST",
      body: buildBody(input),
      phase: "execute",
    });

    return {
      project: requireObject(payload, "Motion create project response"),
    };
  },
  async list_tasks(input, context): Promise<unknown> {
    if (input.includeAllStatuses !== undefined && input.status !== undefined) {
      throw new ProviderRequestError(400, "includeAllStatuses and status cannot be provided together.");
    }
    const payload = await requestMotionJson({
      context,
      path: "/tasks",
      query: queryParams({
        workspaceId: optionalString(input.workspaceId),
        projectId: optionalString(input.projectId),
        assigneeId: optionalString(input.assigneeId),
        cursor: optionalString(input.cursor),
        includeAllStatuses: typeof input.includeAllStatuses === "boolean" ? input.includeAllStatuses : undefined,
        label: optionalString(input.label),
        name: optionalString(input.name),
        status: readOptionalStringArray(input.status)?.join(","),
      }),
      phase: "execute",
    });

    return {
      meta: readObjectProperty(payload, "meta", "Motion tasks response"),
      tasks: readArrayProperty(payload, "tasks", "Motion tasks response"),
    };
  },
  async get_task(input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: `/tasks/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      phase: "execute",
    });

    return {
      task: requireObject(payload, "Motion task response"),
    };
  },
  async create_task(input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: "/tasks",
      method: "POST",
      body: buildBody(input),
      phase: "execute",
    });

    return {
      task: requireObject(payload, "Motion create task response"),
    };
  },
  async update_task(input, context): Promise<unknown> {
    const body = buildBody(input, { skip: new Set(["id"]) });
    if (!taskUpdateFieldNames.some((fieldName) => Object.hasOwn(body, fieldName))) {
      throw new ProviderRequestError(400, "At least one task update field must be provided.");
    }
    const payload = await requestMotionJson({
      context,
      path: `/tasks/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "PATCH",
      body,
      phase: "execute",
    });

    return {
      task: requireObject(payload, "Motion update task response"),
    };
  },
  async delete_task(input, context): Promise<unknown> {
    await requestMotionJson({
      context,
      path: `/tasks/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "DELETE",
      phase: "execute",
    });

    return {
      deleted: true,
    };
  },
  async list_statuses(input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: "/statuses",
      query: queryParams({
        workspaceId: requiredInputString(input.workspaceId, "workspaceId"),
      }),
      phase: "execute",
    });

    return {
      statuses: readArrayPayload(payload, "statuses", "Motion statuses response"),
    };
  },
  async list_schedules(input, context): Promise<unknown> {
    const payload = await requestMotionJson({
      context,
      path: "/schedules",
      query: queryParams({
        workspaceId: requiredInputString(input.workspaceId, "workspaceId"),
      }),
      phase: "execute",
    });

    return {
      schedules: readArrayPayload(payload, "schedules", "Motion schedules response"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, motionActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestMotionJson({
      context: { apiKey: input.apiKey, fetcher, signal },
      path: "/users/me",
      phase: "validate",
    });
    const user = requireObject(payload, "Motion current user response");
    const userId = optionalString(user.id);
    const userEmail = optionalString(user.email);
    const displayName = optionalString(user.name) ?? userEmail ?? userId ?? "Motion API Key";

    return {
      profile: {
        accountId: userId ?? userEmail ?? `motion:${input.apiKey.slice(-6)}`,
        displayName,
      },
      grantedScopes: [],
      metadata: jsonObject({
        apiBaseUrl: motionApiBaseUrl,
        validationEndpoint: "/users/me",
        userId,
        userEmail,
      }),
    };
  },
};

async function requestMotionJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: MotionPhase;
  method?: MotionMethod;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, motionDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(buildMotionUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildMotionHeaders(input.context.apiKey, input.body),
      signal: timeout.signal,
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    const payload = await readMotionPayload(response);

    if (!response.ok) {
      throw createMotionError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Motion request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Motion request failed: ${error.message}` : "Motion request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildMotionUrl(path: string, query?: Record<string, string>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${motionApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function buildMotionHeaders(apiKey: string, body?: Record<string, unknown>): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
    ...(body ? { "content-type": "application/json" } : {}),
  };
}

async function readMotionPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Motion returned invalid JSON");
  }
}

function createMotionError(status: number, payload: unknown, phase: MotionPhase): ProviderRequestError {
  const message = extractMotionErrorMessage(payload) ?? `Motion request failed with status ${status}`;

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? status : status || 502, message, payload);
}

function extractMotionErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(object.detail) ??
    optionalString(object.title)
  );
}

function buildBody(input: Record<string, unknown>, options: { skip?: Set<string> } = {}): Record<string, unknown> {
  return jsonObject(
    Object.fromEntries(Object.entries(input).filter(([key, value]) => value !== undefined && !options.skip?.has(key))),
  );
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return stringArray(value, "status", (message) => new ProviderRequestError(400, message));
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${context} did not return an object`, value);
  }
  return object;
}

function readObjectProperty(value: unknown, key: string, context: string): Record<string, unknown> {
  return requireObject(requireObject(value, context)[key], `${context} ${key}`);
}

function readArrayProperty(value: unknown, key: string, context: string): unknown[] {
  const array = requireObject(value, context)[key];
  if (!Array.isArray(array)) {
    throw new ProviderRequestError(502, `${context} did not return ${key} array`, value);
  }
  return array;
}

function readArrayPayload(value: unknown, key: string, context: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return readArrayProperty(value, key, context);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.usemotion.com/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
