import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { TeamcampActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "teamcamp";
const teamcampApiBaseUrl = "https://api.teamcamp.app/v1.0";

type TeamcampQueryValue = boolean | number | string | null | undefined;
type TeamcampRequestPhase = "validate" | "execute";
type TeamcampActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const teamcampActionHandlers: Record<TeamcampActionName, TeamcampActionHandler> = {
  async list_projects(_input, context): Promise<unknown> {
    const projects = await requestTeamcampJson<Record<string, unknown>[]>({
      apiKey: context.apiKey,
      path: "/project",
      context,
      phase: "execute",
      expectedArray: true,
    });
    return { projects, raw: projects };
  },
  async get_project(input, context): Promise<unknown> {
    const projectId = requiredProviderString(input.projectId, "projectId");
    const project = await requestTeamcampJson<Record<string, unknown>>({
      apiKey: context.apiKey,
      path: `/project/${encodeURIComponent(projectId)}`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { project, raw: project };
  },
  async list_tasks(input, context): Promise<unknown> {
    const tasks = await requestTeamcampJson<Record<string, unknown>[]>({
      apiKey: context.apiKey,
      path: "/task",
      query: compactObject({
        projectId: requiredProviderString(input.projectId, "projectId"),
        complete: typeof input.complete === "boolean" ? input.complete : undefined,
      }),
      context,
      phase: "execute",
      expectedArray: true,
    });
    return { tasks, raw: tasks };
  },
  async get_task(input, context): Promise<unknown> {
    const taskId = requiredProviderString(input.taskId, "taskId");
    const task = await requestTeamcampJson<Record<string, unknown>>({
      apiKey: context.apiKey,
      path: `/task/${encodeURIComponent(taskId)}`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { task, raw: task };
  },
  async post_task_comment(input, context): Promise<unknown> {
    const taskId = requiredProviderString(input.taskId, "taskId");
    const comment = await requestTeamcampJson<Record<string, unknown>>({
      apiKey: context.apiKey,
      path: `/task/${encodeURIComponent(taskId)}/comments`,
      method: "POST",
      body: {
        content: requiredProviderString(input.content, "content"),
      },
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { comment, raw: comment };
  },
  async list_company_users(_input, context): Promise<unknown> {
    const users = await requestTeamcampJson<Record<string, unknown>[]>({
      apiKey: context.apiKey,
      path: "/company/users",
      context,
      phase: "execute",
      expectedArray: true,
    });
    return { users, raw: users };
  },
  async list_customers(_input, context): Promise<unknown> {
    const customers = await requestTeamcampJson<Record<string, unknown>[]>({
      apiKey: context.apiKey,
      path: "/company/customers",
      context,
      phase: "execute",
      expectedArray: true,
    });
    return { customers, raw: customers };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, teamcampActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: teamcampApiBaseUrl,
  auth: { type: "api_key_header", name: "apiKey" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestTeamcampJson<Record<string, unknown>>({
      apiKey: input.apiKey,
      path: "/verify",
      context: { fetcher, signal },
      phase: "validate",
    });
    const workspaceId = optionalString(payload.workspaceId);
    const workspaceName = optionalString(payload.workspaceName);
    const createdBy = optionalString(payload.createdBy);
    const userId = optionalString(payload.userId);
    const email = optionalString(payload.email);

    return {
      profile: {
        accountId: workspaceId ? `teamcamp:${workspaceId}` : undefined,
        displayName: workspaceName ?? email ?? createdBy ?? "Teamcamp API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: teamcampApiBaseUrl,
        validationEndpoint: "/verify",
        workspaceId,
        workspaceName,
        createdBy,
        userId,
        email,
      }),
    };
  },
};

async function requestTeamcampJson<T>(options: {
  apiKey: string;
  path: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: TeamcampRequestPhase;
  method?: string;
  query?: Record<string, TeamcampQueryValue>;
  body?: unknown;
  expectedArray?: boolean;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const hasJsonBody = options.body !== undefined;
  const response = await options.context.fetcher(buildTeamcampUrl(options.path, options.query), {
    method: options.method ?? "GET",
    headers: buildTeamcampHeaders(options.apiKey, hasJsonBody),
    body: hasJsonBody ? JSON.stringify(options.body) : undefined,
    signal: options.context.signal,
  });
  const payload = await readTeamcampPayload(response);

  if (!response.ok) {
    throw createTeamcampError(response, payload, options.phase, options.notFoundAsInvalidInput);
  }
  if (options.expectedArray) {
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "teamcamp response body must be an array");
    }
    return payload as T;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "teamcamp response body must be an object");
  }
  return payload as T;
}

function buildTeamcampUrl(path: string, query: Record<string, TeamcampQueryValue> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${teamcampApiBaseUrl}${normalizedPath}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildTeamcampHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readTeamcampPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTeamcampError(
  response: Response,
  payload: unknown,
  _phase: TeamcampRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message =
    extractTeamcampErrorMessage(payload) ?? response.statusText ?? `teamcamp request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403 ||
    (response.status === 404 && notFoundAsInvalidInput)
  ) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractTeamcampErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail))
    : undefined;
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
