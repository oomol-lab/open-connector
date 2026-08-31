import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const buildkiteApiBaseUrl = "https://api.buildkite.com/v2";

type BuildkiteRequestPhase = "validate" | "execute";
type BuildkiteQueryValue = string | number | boolean | undefined;
type BuildkiteActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface PaginationLinks {
  next: string | null;
  prev: string | null;
  first: string | null;
  last: string | null;
}

export const buildkiteActionHandlers: ProviderActionHandlers<"buildkite", BuildkiteActionHandler> = {
  get_current_access_token(input, context) {
    return getCurrentAccessToken(input, context);
  },
  get_current_user(input, context) {
    return getCurrentUser(input, context);
  },
  list_organizations(input, context) {
    return listOrganizations(input, context);
  },
  get_organization(input, context) {
    return getOrganization(input, context);
  },
  list_pipelines(input, context) {
    return listPipelines(input, context);
  },
  get_pipeline(input, context) {
    return getPipeline(input, context);
  },
  list_builds_for_organization(input, context) {
    return listBuildsForOrganization(input, context);
  },
  list_builds_for_pipeline(input, context) {
    return listBuildsForPipeline(input, context);
  },
  get_build(input, context) {
    return getBuild(input, context);
  },
  create_build(input, context) {
    return createBuild(input, context);
  },
  cancel_build(input, context) {
    return cancelBuild(input, context);
  },
  rebuild_build(input, context) {
    return rebuildBuild(input, context);
  },
};

export async function validateBuildkiteCredential(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  const accessToken = await requestBuildkiteJson<{
    uuid?: unknown;
    scopes?: unknown;
    description?: unknown;
    user?: unknown;
  }>({
    apiKey: input.apiKey,
    path: "/access-token",
    fetcher: input.fetcher,
    signal: input.signal,
    phase: "validate",
  });

  const uuid = requireResponseString(accessToken.uuid, "uuid");
  const scopes = readStringArray(accessToken.scopes);
  const description = optionalString(accessToken.description);
  const user = optionalRecord(accessToken.user);
  const userName = optionalString(user?.name);
  const userEmail = optionalString(user?.email);

  return {
    profile: {
      accountId: userEmail ?? uuid,
      displayName: firstNonEmptyString(userName, userEmail, description) ?? "Buildkite API Token",
    },
    grantedScopes: scopes,
    metadata: compactObject({
      validationEndpoint: "/access-token",
      token_uuid: uuid,
      description,
      user_name: userName,
      user_email: userEmail,
    }),
  };
}

async function getCurrentAccessToken(
  _input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return requestBuildkiteJson({
    apiKey: context.apiKey,
    path: "/access-token",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function getCurrentUser(_input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return requestBuildkiteJson({
    apiKey: context.apiKey,
    path: "/user",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function listOrganizations(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items, links } = await requestBuildkiteList({
    apiKey: context.apiKey,
    path: "/organizations",
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      per_page: readOptionalPerPage(input.per_page),
    }) as Record<string, BuildkiteQueryValue>,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    organizations: items,
    links,
  };
}

async function getOrganization(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  return requestBuildkiteJson({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function listPipelines(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  const { items, links } = await requestBuildkiteList({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}/pipelines`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      per_page: readOptionalPerPage(input.per_page),
      name: optionalString(input.name),
      repository: optionalString(input.repository),
    }) as Record<string, BuildkiteQueryValue>,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    pipelines: items,
    links,
  };
}

async function getPipeline(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  const pipelineSlug = requiredInputString(input.pipeline_slug, "pipeline_slug");
  return requestBuildkiteJson({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}/pipelines/${encodeURIComponent(pipelineSlug)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function listBuildsForOrganization(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  const { items, links } = await requestBuildkiteList({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}/builds`,
    query: readBuildListQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    builds: items,
    links,
  };
}

async function listBuildsForPipeline(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  const pipelineSlug = requiredInputString(input.pipeline_slug, "pipeline_slug");
  const { items, links } = await requestBuildkiteList({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}/pipelines/${encodeURIComponent(pipelineSlug)}/builds`,
    query: readBuildListQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    builds: items,
    links,
  };
}

async function getBuild(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  const pipelineSlug = requiredInputString(input.pipeline_slug, "pipeline_slug");
  const number = requirePositiveInteger(input.number, "number");
  return requestBuildkiteJson({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}/pipelines/${encodeURIComponent(pipelineSlug)}/builds/${number}`,
    query: compactObject({
      include_retried_jobs: typeof input.include_retried_jobs === "boolean" ? input.include_retried_jobs : undefined,
      include_test_engine: typeof input.include_test_engine === "boolean" ? input.include_test_engine : undefined,
    }) as Record<string, BuildkiteQueryValue>,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function createBuild(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  const pipelineSlug = requiredInputString(input.pipeline_slug, "pipeline_slug");
  return requestBuildkiteJson({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}/pipelines/${encodeURIComponent(pipelineSlug)}/builds`,
    method: "POST",
    body: compactObject({
      commit: requiredInputString(input.commit, "commit"),
      branch: requiredInputString(input.branch, "branch"),
      message: optionalString(input.message),
      author: optionalRecord(input.author),
      env: optionalRecord(input.env),
      meta_data: optionalRecord(input.meta_data),
      clean_checkout: typeof input.clean_checkout === "boolean" ? input.clean_checkout : undefined,
      ignore_pipeline_branch_filters:
        typeof input.ignore_pipeline_branch_filters === "boolean" ? input.ignore_pipeline_branch_filters : undefined,
      pull_request_id: readOptionalPositiveInteger(input.pull_request_id, "pull_request_id"),
      pull_request_base_branch: optionalString(input.pull_request_base_branch),
      pull_request_repository: optionalString(input.pull_request_repository),
      pull_request_labels: Array.isArray(input.pull_request_labels)
        ? input.pull_request_labels.map((value) => String(value))
        : undefined,
    }) as Record<string, unknown>,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function cancelBuild(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  const pipelineSlug = requiredInputString(input.pipeline_slug, "pipeline_slug");
  const number = requirePositiveInteger(input.number, "number");
  return requestBuildkiteJson({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}/pipelines/${encodeURIComponent(pipelineSlug)}/builds/${number}/cancel`,
    method: "PUT",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function rebuildBuild(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const orgSlug = requiredInputString(input.org_slug, "org_slug");
  const pipelineSlug = requiredInputString(input.pipeline_slug, "pipeline_slug");
  const number = requirePositiveInteger(input.number, "number");
  return requestBuildkiteJson({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(orgSlug)}/pipelines/${encodeURIComponent(pipelineSlug)}/builds/${number}/rebuild`,
    method: "PUT",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function requestBuildkiteJson<T>(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: BuildkiteRequestPhase;
  method?: string;
  query?: Record<string, BuildkiteQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const response = await buildkiteFetch(input);
  if (!response.ok) {
    throw await toBuildkiteError(response, input.phase, input.notFoundAsInvalidInput);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "Buildkite returned invalid JSON");
  }
}

async function requestBuildkiteList(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: BuildkiteRequestPhase;
  method?: string;
  query?: Record<string, BuildkiteQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<{ items: unknown[]; links: PaginationLinks }> {
  const response = await buildkiteFetch(input);
  if (!response.ok) {
    throw await toBuildkiteError(response, input.phase, input.notFoundAsInvalidInput);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, "Buildkite returned invalid JSON");
  }

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Buildkite list response must be an array", payload);
  }

  return {
    items: payload,
    links: parseBuildkitePaginationLinks(response.headers.get("Link")),
  };
}

async function buildkiteFetch(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, BuildkiteQueryValue>;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const url = new URL(`${buildkiteApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });

  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  const timeout = createProviderTimeout(input.signal);
  try {
    return await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Buildkite request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Buildkite request failed: ${error.message}` : "Buildkite request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function toBuildkiteError(
  response: Response,
  phase: BuildkiteRequestPhase,
  notFoundAsInvalidInput?: boolean,
): Promise<ProviderRequestError> {
  const message = await extractBuildkiteErrorMessage(response);

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

async function extractBuildkiteErrorMessage(response: Response): Promise<string> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return `Buildkite request failed with status ${response.status}`;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return `Buildkite request failed with status ${response.status}`;
  }

  const message = optionalString(record.message);
  if (message) {
    return message;
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  if (errors && errors.length > 0) {
    const firstError = errors[0];
    if (typeof firstError === "string" && firstError.length > 0) {
      return firstError;
    }
    const errorRecord = optionalRecord(firstError);
    const detail = optionalString(errorRecord?.message);
    if (detail) {
      return detail;
    }
  }

  return `Buildkite request failed with status ${response.status}`;
}

function parseBuildkitePaginationLinks(linkHeader: string | null): PaginationLinks {
  const links: PaginationLinks = {
    next: null,
    prev: null,
    first: null,
    last: null,
  };

  if (!linkHeader) {
    return links;
  }

  for (const entry of linkHeader.split(",")) {
    const trimmedEntry = entry.trim();
    const separatorIndex = trimmedEntry.indexOf(";");
    if (separatorIndex === -1) {
      continue;
    }

    const urlPart = trimmedEntry.slice(0, separatorIndex).trim();
    const relPart = trimmedEntry.slice(separatorIndex + 1).trim();
    if (!urlPart.startsWith("<") || !urlPart.endsWith(">")) {
      continue;
    }

    const relMarker = 'rel="';
    const relStart = relPart.indexOf(relMarker);
    if (relStart === -1) {
      continue;
    }

    const relValueStart = relStart + relMarker.length;
    const relValueEnd = relPart.indexOf('"', relValueStart);
    if (relValueEnd === -1) {
      continue;
    }

    const rel = relPart.slice(relValueStart, relValueEnd);
    if (rel === "next" || rel === "prev" || rel === "first" || rel === "last") {
      links[rel] = urlPart.slice(1, -1);
    }
  }

  return links;
}

function readBuildListQuery(input: Record<string, unknown>): Record<string, BuildkiteQueryValue> {
  return compactObject({
    page: readOptionalPositiveInteger(input.page, "page"),
    per_page: readOptionalPerPage(input.per_page),
    branch: optionalString(input.branch),
    commit: optionalString(input.commit),
    created_from: optionalString(input.created_from),
    created_to: optionalString(input.created_to),
    finished_from: optionalString(input.finished_from),
    state: optionalString(input.state),
    include_retried_jobs: typeof input.include_retried_jobs === "boolean" ? input.include_retried_jobs : undefined,
  }) as Record<string, BuildkiteQueryValue>;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return requirePositiveInteger(value, fieldName);
}

function readOptionalPerPage(value: unknown): number | undefined {
  const parsed = readOptionalPositiveInteger(value, "per_page");
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed > 100) {
    throw new ProviderRequestError(400, "per_page must be less than or equal to 100");
  }
  return parsed;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Buildkite response missing ${fieldName}`);
  }
  return parsed;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}
