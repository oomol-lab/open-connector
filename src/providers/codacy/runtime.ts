import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalString,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const codacyApiBaseUrl = "https://app.codacy.com";
const codacyApiPathPrefix = "/api/v3";

interface CodacyCredentialInput {
  apiKey: string;
}

type CodacyRequestPhase = "validate" | "execute";
type CodacyQueryValue = string | number | boolean | undefined;
type CodacyRuntimeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CodacyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const codacyActionHandlers: ProviderActionHandlers<"codacy", CodacyActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestCodacyJson<{ data?: unknown }>({
      context,
      path: "/user",
      phase: "execute",
    });

    return {
      user: requiredRecord(payload.data, "data", providerResponseError),
    };
  },

  async list_user_organizations(input, context) {
    const provider = optionalString(input.provider);
    const payload = await requestCodacyJson<{ data?: unknown; pagination?: unknown }>({
      context,
      path: provider ? `/user/organizations/${encodeURIComponent(provider)}` : "/user/organizations",
      query: readPaginationQuery(input),
      phase: "execute",
    });

    return {
      organizations: readResponseArray(payload.data, "data"),
      pagination: readPagination(payload.pagination),
    };
  },

  async list_repository_analyses(input, context) {
    const payload = await requestCodacyJson<{ data?: unknown; pagination?: unknown }>({
      context,
      path: `/analysis/organizations/${encodeURIComponent(
        requireInputString(input.provider, "provider"),
      )}/${encodeURIComponent(requireInputString(input.remoteOrganizationName, "remoteOrganizationName"))}/repositories`,
      query: compactObject({
        ...readPaginationQuery(input),
        search: optionalString(input.search),
        segments: optionalString(input.segments),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      repositories: readResponseArray(payload.data, "data"),
      pagination: readPagination(payload.pagination),
    };
  },

  async get_repository_analysis(input, context) {
    const payload = await requestCodacyJson<{ data?: unknown }>({
      context,
      path: `/analysis/organizations/${encodeURIComponent(
        requireInputString(input.provider, "provider"),
      )}/${encodeURIComponent(requireInputString(input.remoteOrganizationName, "remoteOrganizationName"))}/repositories/${encodeURIComponent(
        requireInputString(input.repositoryName, "repositoryName"),
      )}`,
      query: compactObject({
        branch: optionalString(input.branch),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      repository: requiredRecord(payload.data, "data", providerResponseError),
    };
  },

  async list_tools(input, context) {
    const payload = await requestCodacyJson<{ data?: unknown; pagination?: unknown }>({
      context,
      path: "/tools",
      query: readPaginationQuery(input),
      phase: "execute",
    });

    return {
      tools: readResponseArray(payload.data, "data"),
      pagination: readPagination(payload.pagination),
    };
  },

  async list_languages(_input, context) {
    const payload = await requestCodacyJson<{ data?: unknown }>({
      context,
      path: "/languages/tools",
      phase: "execute",
    });

    return {
      languages: readResponseArray(payload.data, "data"),
    };
  },

  async list_tool_patterns(input, context) {
    const payload = await requestCodacyJson<{ data?: unknown; pagination?: unknown }>({
      context,
      path: `/tools/${encodeURIComponent(requireInputString(input.toolUuid, "toolUuid"))}/patterns`,
      query: compactObject({
        ...readPaginationQuery(input),
        enabled: optionalBoolean(input.enabled),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      patterns: readResponseArray(payload.data, "data"),
      pagination: readPagination(payload.pagination),
    };
  },

  async get_tool_pattern(input, context) {
    const payload = await requestCodacyJson<{ data?: unknown }>({
      context,
      path: `/tools/${encodeURIComponent(requireInputString(input.toolUuid, "toolUuid"))}/patterns/${encodeURIComponent(
        requireInputString(input.patternId, "patternId"),
      )}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      pattern: requiredRecord(payload.data, "data", providerResponseError),
    };
  },
};

export async function validateCodacyApiKey(
  input: CodacyCredentialInput,
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const context: CodacyRuntimeContext = {
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
  };
  const payload = await requestCodacyJson<{ data?: unknown }>({
    context,
    path: "/user",
    phase: "validate",
  });

  const user = requiredRecord(payload.data, "data", providerResponseError);
  const accountId = optionalString(user.id) ?? readOptionalNumberAsString(user.id) ?? "codacy-user";
  const displayName =
    pickFirstNonEmptyString(optionalString(user.name), optionalString(user.mainEmail), accountId) ?? "Codacy User";

  return {
    profile: {
      accountId,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: `${codacyApiBaseUrl}${codacyApiPathPrefix}`,
      validationEndpoint: "/user",
      mainEmail: optionalString(user.mainEmail),
      isAdmin: optionalBoolean(user.isAdmin),
      isActive: optionalBoolean(user.isActive),
    }),
  };
}

async function requestCodacyJson<T>(input: {
  context: CodacyRuntimeContext;
  path: string;
  phase: CodacyRequestPhase;
  query?: Record<string, CodacyQueryValue>;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const response = await codacyFetch(input);
  if (!response.ok) {
    throw await toCodacyError(response, input.phase, input.notFoundAsInvalidInput === true);
  }

  return readJsonResponse<T>(response);
}

async function codacyFetch(input: {
  context: CodacyRuntimeContext;
  path: string;
  query?: Record<string, CodacyQueryValue>;
}): Promise<Response> {
  const url = new URL(`${codacyApiPathPrefix}${input.path}`, codacyApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await input.context.fetcher(url, {
      method: "GET",
      headers: codacyHeaders(input.context.apiKey),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `codacy request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function codacyHeaders(apiKey: string): Headers {
  return new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "api-token": apiKey,
  });
}

async function toCodacyError(
  response: Response,
  phase: CodacyRequestPhase,
  notFoundAsInvalidInput: boolean,
): Promise<ProviderRequestError> {
  const message = await readCodacyErrorMessage(response);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

async function readCodacyErrorMessage(response: Response): Promise<string> {
  try {
    const payload = requiredRecord(await response.json(), "codacy error", providerResponseError);
    const message = optionalString(payload.message);
    const error = optionalString(payload.error);
    const code = optionalString(payload.code);
    if (message || error || code) {
      return message ?? error ?? code ?? defaultCodacyErrorMessage(response.status);
    }
  } catch {}

  return defaultCodacyErrorMessage(response.status);
}

function defaultCodacyErrorMessage(status: number): string {
  return `Codacy API request failed with status ${status}`;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `codacy response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readPaginationQuery(input: Record<string, unknown>): Record<string, CodacyQueryValue> {
  return compactObject({
    cursor: optionalString(input.cursor),
    limit: readOptionalPositiveInteger(input.limit, "limit"),
  });
}

function readPagination(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requiredRecord(value, "pagination", providerResponseError);
}

function readResponseArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `codacy response missing ${fieldName}`);
  }
  return value.map((item) => requiredRecord(item, fieldName, providerResponseError));
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, invalidInputError);
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return positiveInteger(value, fieldName, invalidInputError);
}

function readOptionalNumberAsString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function pickFirstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
