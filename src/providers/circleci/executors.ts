import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { CircleciActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "circleci";
const circleciApiBaseUrl = "https://circleci.com/api/v2";

type CircleciActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type CircleciRequestPhase = "validate" | "execute";

export const circleciActionHandlers: Record<CircleciActionName, CircleciActionHandler> = {
  get_current_user(_input, context) {
    return requestCircleciJson({ apiKey: context.apiKey, path: "/me", context, phase: "execute" });
  },
  get_project(input, context) {
    return requestCircleciJson({
      apiKey: context.apiKey,
      path: `/project/${encodeURIComponent(normalizeProjectSlugField(input.projectSlug))}`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_pipelines_for_project(input, context) {
    return requestCircleciJson({
      apiKey: context.apiKey,
      path: `/project/${encodeURIComponent(normalizeProjectSlugField(input.projectSlug))}/pipeline`,
      query: compactObject({
        branch: optionalString(input.branch),
        "page-token": optionalString(input.pageToken),
      }),
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  get_pipeline(input, context) {
    return requestCircleciJson({
      apiKey: context.apiKey,
      path: `/pipeline/${encodeURIComponent(requiredInputString(input.pipelineId, "pipelineId"))}`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_workflows_by_pipeline(input, context) {
    return requestCircleciJson({
      apiKey: context.apiKey,
      path: `/pipeline/${encodeURIComponent(requiredInputString(input.pipelineId, "pipelineId"))}/workflow`,
      query: compactObject({ "page-token": optionalString(input.pageToken) }),
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  get_workflow_summary(input, context) {
    if (typeof input.allBranches === "boolean" && optionalString(input.branch)) {
      throw new ProviderRequestError(400, "allBranches and branch cannot be used together");
    }
    return requestCircleciJson({
      apiKey: context.apiKey,
      path:
        `/insights/${encodeURIComponent(normalizeProjectSlugField(input.projectSlug))}/workflows/` +
        `${encodeURIComponent(requiredInputString(input.workflowName, "workflowName"))}/summary`,
      query: compactObject({
        "all-branches": typeof input.allBranches === "boolean" ? String(input.allBranches) : undefined,
        branch: optionalString(input.branch),
      }),
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  get_job_details(input, context) {
    return requestCircleciJson({
      apiKey: context.apiKey,
      path:
        `/project/${encodeURIComponent(normalizeProjectSlugField(input.projectSlug))}/job/` +
        `${readPositiveInteger(input.jobNumber, "jobNumber")}`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  get_job_artifacts(input, context) {
    return requestCircleciJson({
      apiKey: context.apiKey,
      path:
        `/project/${encodeURIComponent(normalizeProjectSlugField(input.projectSlug))}/` +
        `${readPositiveInteger(input.jobNumber, "jobNumber")}/artifacts`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_insights_summary(input, context) {
    return requestCircleciJson({
      apiKey: context.apiKey,
      path: `/insights/${encodeURIComponent(normalizeOrgSlugField(input.orgSlug))}/summary`,
      query: compactObject({ "reporting-window": optionalString(input.reportingWindow) }),
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  trigger_pipeline(input, context) {
    if (optionalString(input.branch) && optionalString(input.tag)) {
      throw new ProviderRequestError(400, "branch and tag cannot be used together");
    }
    return requestCircleciJson({
      apiKey: context.apiKey,
      path: `/project/${encodeURIComponent(normalizeProjectSlugField(input.projectSlug))}/pipeline`,
      method: "POST",
      body: compactObject({
        branch: optionalString(input.branch),
        tag: optionalString(input.tag),
        parameters: optionalRecord(input.parameters),
      }),
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_project_env_vars(input, context) {
    return requestCircleciJson({
      apiKey: context.apiKey,
      path: `/project/${encodeURIComponent(normalizeProjectSlugField(input.projectSlug))}/envvar`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, circleciActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCircleciCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};

async function validateCircleciCredential(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  const user = await requestCircleciJson<Record<string, unknown>>({
    apiKey: input.apiKey,
    path: "/me",
    fetcher: input.fetcher,
    signal: input.signal,
    phase: "validate",
  });
  const accountId = requiredResponseString(user.id, "id");
  const login = optionalString(user.login);
  const name = optionalString(user.name);
  const avatarUrl = optionalString(user.avatar_url);

  return {
    profile: {
      accountId,
      displayName: name ?? login ?? "CircleCI User",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/me",
      login,
      name,
      avatar_url: avatarUrl,
    }),
  };
}

async function requestCircleciJson<T>(input: {
  apiKey: string;
  path: string;
  phase: CircleciRequestPhase;
  context?: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const url = new URL(`${circleciApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const fetcher = input.context?.fetcher ?? input.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: input.method ?? "GET",
      headers: buildCircleciHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context?.signal ?? input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `circleci ${input.phase} request failed: ${error.message}` : "circleci request failed",
    );
  }

  const payload = await readCircleciPayload(response, input.phase);
  if (!response.ok) {
    throw createCircleciError(response, payload, input.phase, input.notFoundAsInvalidInput === true);
  }
  return payload as T;
}

function buildCircleciHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    "Circle-Token": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readCircleciPayload(response: Response, phase: CircleciRequestPhase): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `circleci ${phase} response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function createCircleciError(
  response: Response,
  payload: unknown,
  phase: CircleciRequestPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readCircleciErrorMessage(payload) ?? `circleci request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || (response.status === 404 && notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function readCircleciErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function normalizeProjectSlugField(value: unknown): string {
  return normalizeSlug(requiredInputString(value, "projectSlug"), {
    fieldName: "projectSlug",
    stripProjectPrefix: true,
  });
}

function normalizeOrgSlugField(value: unknown): string {
  return normalizeSlug(requiredInputString(value, "orgSlug"), {
    fieldName: "orgSlug",
    stripProjectPrefix: false,
  });
}

function normalizeSlug(rawValue: string, input: { fieldName: string; stripProjectPrefix: boolean }): string {
  let value = rawValue.trim();
  if (input.stripProjectPrefix) {
    if (value.startsWith("/project/")) {
      value = value.slice("/project/".length);
    } else if (value.startsWith("project/")) {
      value = value.slice("project/".length);
    }
  }

  if (value.includes("%2F") || value.includes("%2f")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      throw new ProviderRequestError(400, `${input.fieldName} is invalid`);
    }
  }

  value = trimSlashes(value);
  if (!value) {
    throw new ProviderRequestError(400, `${input.fieldName} is invalid`);
  }
  return value;
}

function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "/") start += 1;
  while (end > start && value[end - 1] === "/") end -= 1;
  return value.slice(start, end);
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requiredInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function requiredResponseString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `circleci response missing required field: ${fieldName}`);
  }
  return text;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://circleci.com/api/v2",
  auth: { type: "api_key_header", name: "circle-token" },
});
