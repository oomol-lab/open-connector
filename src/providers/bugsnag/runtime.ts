import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BugsnagActionName } from "./actions.ts";

import { optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const bugsnagApiBaseUrl: string = "https://api.bugsnag.com";
const bugsnagDefaultRequestTimeoutMs = 30_000;

type BugsnagQueryValue = string | number | boolean | undefined;
type BugsnagRequestPhase = "validate" | "execute";
type BugsnagActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface BugsnagJsonResponse {
  payload: unknown;
  headers: Headers;
}

export const bugsnagActionHandlers: Record<BugsnagActionName, BugsnagActionHandler> = {
  list_organizations(input, context) {
    return listOrganizations(input, context);
  },
  get_organization(input, context) {
    return getOrganization(input, context);
  },
  list_organization_projects(input, context) {
    return listOrganizationProjects(input, context);
  },
  list_project_errors(input, context) {
    return listProjectErrors(input, context);
  },
  list_error_events(input, context) {
    return listErrorEvents(input, context);
  },
  get_latest_error_event(input, context) {
    return getLatestErrorEvent(input, context);
  },
  list_project_releases(input, context) {
    return listProjectReleases(input, context);
  },
};

export async function validateBugsnagCredential(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  const { payload } = await requestBugsnagJson({
    apiKey: input.apiKey,
    path: "/user/organizations",
    fetcher: input.fetcher,
    signal: input.signal,
    phase: "validate",
  });

  const organizations = requireArrayPayload(payload, "bugsnag organizations");
  if (organizations.length === 0) {
    throw new ProviderRequestError(
      502,
      "bugsnag organizations response did not include an accessible organization",
      payload,
    );
  }

  const organization = requireResponseRecord(organizations[0], "bugsnag organization");
  const organizationId = requiredString(organization.id, "bugsnag organization id", providerOutputError);
  const organizationSlug = optionalString(organization.slug);
  const accountLabel = optionalString(organization.name) ?? organizationSlug ?? "Bugsnag Personal Auth Token";

  return {
    profile: {
      accountId: organizationId,
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: bugsnagApiBaseUrl,
      validationEndpoint: "/user/organizations",
      organizationId,
      ...(organizationSlug ? { organizationSlug } : {}),
    },
  };
}

async function listOrganizations(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const response = await requestBugsnagJson({
    apiKey: context.apiKey,
    path: "/user/organizations",
    query: {
      admin: readBoolean(input.admin),
      per_page: readNumber(input.perPage),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    organizations: requireArrayPayload(response.payload, "bugsnag organizations"),
    pagination: normalizePagination(response.headers),
  };
}

async function getOrganization(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const organizationId = readRequiredInputString(input.organizationId, "organizationId");
  const response = await requestBugsnagJson({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(organizationId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    organization: requireResponseRecord(response.payload, "bugsnag organization"),
  };
}

async function listOrganizationProjects(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const organizationId = readRequiredInputString(input.organizationId, "organizationId");
  const response = await requestBugsnagJson({
    apiKey: context.apiKey,
    path: `/organizations/${encodeURIComponent(organizationId)}/projects`,
    query: {
      q: readString(input.query),
      sort: readString(input.sort),
      direction: readString(input.direction),
      per_page: readNumber(input.perPage),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    projects: requireArrayPayload(response.payload, "bugsnag projects"),
    pagination: normalizePagination(response.headers),
  };
}

async function listProjectErrors(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredInputString(input.projectId, "projectId");
  const response = await requestBugsnagJson({
    apiKey: context.apiKey,
    path: `/projects/${encodeURIComponent(projectId)}/errors`,
    query: {
      base: readString(input.base),
      sort: readString(input.sort),
      direction: readString(input.direction),
      per_page: readNumber(input.perPage),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    errors: requireArrayPayload(response.payload, "bugsnag errors"),
    pagination: normalizePagination(response.headers),
  };
}

async function listErrorEvents(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredInputString(input.projectId, "projectId");
  const errorId = readRequiredInputString(input.errorId, "errorId");
  const response = await requestBugsnagJson({
    apiKey: context.apiKey,
    path: `/projects/${encodeURIComponent(projectId)}/errors/${encodeURIComponent(errorId)}/events`,
    query: {
      base: readString(input.base),
      direction: readString(input.direction),
      per_page: readNumber(input.perPage),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    events: requireArrayPayload(response.payload, "bugsnag error events"),
    pagination: normalizePagination(response.headers),
  };
}

async function getLatestErrorEvent(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const errorId = readRequiredInputString(input.errorId, "errorId");
  const response = await requestBugsnagJson({
    apiKey: context.apiKey,
    path: `/errors/${encodeURIComponent(errorId)}/latest_event`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    event: requireResponseRecord(response.payload, "bugsnag latest event"),
  };
}

async function listProjectReleases(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredInputString(input.projectId, "projectId");
  const response = await requestBugsnagJson({
    apiKey: context.apiKey,
    path: `/projects/${encodeURIComponent(projectId)}/releases`,
    query: {
      release_stage: readString(input.releaseStage),
      base: readString(input.base),
      sort: readString(input.sort),
      offset: readNumber(input.offset),
      per_page: readNumber(input.perPage),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    releases: requireArrayPayload(response.payload, "bugsnag releases"),
    pagination: normalizePagination(response.headers),
  };
}

async function requestBugsnagJson(input: {
  apiKey: string;
  path: string;
  query?: Record<string, BugsnagQueryValue>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: BugsnagRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<BugsnagJsonResponse> {
  const timeout = createProviderTimeout(input.signal, bugsnagDefaultRequestTimeoutMs);
  const url = new URL(input.path, bugsnagApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `token ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readBugsnagPayload(response);

    if (!response.ok) {
      throw createBugsnagError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
    }

    return {
      payload,
      headers: response.headers,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `bugsnag ${input.path} request timed out after 30 seconds`);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Bugsnag request failed: ${error.message}` : "Bugsnag request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readBugsnagPayload(response: Response): Promise<unknown> {
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

function createBugsnagError(
  status: number,
  payload: unknown,
  phase: BugsnagRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractBugsnagErrorMessage(payload) ?? `Bugsnag request failed with ${status}`;

  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function extractBugsnagErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = requiredOptionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = readString(record.error);
  if (error) {
    return error;
  }
  const message = readString(record.message);
  if (message) {
    return message;
  }
  if (Array.isArray(record.errors) && typeof record.errors[0] === "string") {
    return record.errors[0];
  }
  return undefined;
}

function normalizePagination(headers: Headers): { nextUrl: string | null; totalCount: number | null } {
  const totalCountHeader = headers.get("X-Total-Count");
  const totalCount = totalCountHeader && Number.isInteger(Number(totalCountHeader)) ? Number(totalCountHeader) : null;
  return {
    nextUrl: extractNextUrl(headers.get("Link")),
    totalCount,
  };
}

function extractNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1] ?? null;
}

function requireArrayPayload(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} payload is invalid`, payload);
  }
  return payload;
}

function requireResponseRecord(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, providerOutputError);
}

function requiredOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
