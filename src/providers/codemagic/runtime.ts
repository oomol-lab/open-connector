import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const codemagicV3BaseUrl = "https://codemagic.io";
const codemagicLegacyBaseUrl = "https://api.codemagic.io";

interface CodemagicCredentialInput {
  apiKey: string;
}

type CodemagicRequestPhase = "validate" | "execute";
type CodemagicQueryValue = string | number | boolean | string[] | undefined;
type CodemagicRuntimeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CodemagicActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const codemagicActionHandlers: ProviderActionHandlers<"codemagic", CodemagicActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestCodemagicV3Json<{ data?: unknown }>({
      context,
      path: "/api/v3/user",
      phase: "execute",
    });

    return requiredRecord(payload.data, "data", providerResponseError);
  },

  async list_user_teams(input, context) {
    const payload = await requestCodemagicV3Json<{
      data?: unknown;
      page_size?: unknown;
      current_page?: unknown;
      total_pages?: unknown;
    }>({
      context,
      path: "/api/v3/user/teams",
      query: compactObject({
        page: readOptionalPositiveInteger(input.page, "page"),
        page_size: readOptionalPageSize(input.page_size),
      }),
      phase: "execute",
    });

    return {
      teams: readResponseArray(payload.data, "data"),
      page_size: requireResponsePositiveInteger(payload.page_size, "page_size"),
      current_page: requireResponsePositiveInteger(payload.current_page, "current_page"),
      total_pages: requireResponsePositiveInteger(payload.total_pages, "total_pages"),
    };
  },

  async list_user_apps(input, context) {
    const payload = await requestCodemagicV3Json<{
      data?: unknown;
      page_size?: unknown;
      current_page?: unknown;
      total_pages?: unknown;
    }>({
      context,
      path: "/api/v3/user/apps",
      query: compactObject({
        page: readOptionalPositiveInteger(input.page, "page"),
        page_size: readOptionalPageSize(input.page_size),
      }),
      phase: "execute",
    });

    return {
      apps: readResponseArray(payload.data, "data"),
      page_size: requireResponsePositiveInteger(payload.page_size, "page_size"),
      current_page: requireResponsePositiveInteger(payload.current_page, "current_page"),
      total_pages: requireResponsePositiveInteger(payload.total_pages, "total_pages"),
    };
  },

  async list_team_apps(input, context) {
    const teamId = requiredInputString(input.team_id, "team_id");
    const payload = await requestCodemagicV3Json<{
      data?: unknown;
      page_size?: unknown;
      current_page?: unknown;
      total_pages?: unknown;
    }>({
      context,
      path: `/api/v3/teams/${encodeURIComponent(teamId)}/apps`,
      query: compactObject({
        page: readOptionalPositiveInteger(input.page, "page"),
        page_size: readOptionalPageSize(input.page_size),
        id: readOptionalStringArray(input.id),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      apps: readResponseArray(payload.data, "data"),
      page_size: requireResponsePositiveInteger(payload.page_size, "page_size"),
      current_page: requireResponsePositiveInteger(payload.current_page, "current_page"),
      total_pages: requireResponsePositiveInteger(payload.total_pages, "total_pages"),
    };
  },

  async list_team_builds(input, context) {
    const teamId = requiredInputString(input.team_id, "team_id");
    const payload = await requestCodemagicV3Json<{
      data?: unknown;
      page_size?: unknown;
      cursor?: unknown;
    }>({
      context,
      path: `/api/v3/teams/${encodeURIComponent(teamId)}/builds`,
      query: compactObject({
        app_id: optionalString(input.app_id),
        status: optionalString(input.status),
        workflow_id: optionalString(input.workflow_id),
        branch: optionalString(input.branch),
        tag: optionalString(input.tag),
        label: readOptionalStringArray(input.label),
        cursor: optionalString(input.cursor),
        page_size: readOptionalPageSize(input.page_size),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      builds: readResponseArray(payload.data, "data"),
      page_size: requireResponsePositiveInteger(payload.page_size, "page_size"),
      cursor: readNullableString(payload.cursor),
    };
  },

  async get_build(input, context) {
    const buildId = requiredInputString(input.build_id, "build_id");
    const payload = await requestCodemagicV3Json<{ data?: unknown }>({
      context,
      path: `/api/v3/builds/${encodeURIComponent(buildId)}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return requiredRecord(payload.data, "data", providerResponseError);
  },

  async create_build(input, context) {
    if (!optionalString(input.branch) && !optionalString(input.tag)) {
      throw new ProviderRequestError(400, "Either branch or tag is required.");
    }

    const payload = await requestCodemagicLegacyJson<{ buildId?: unknown }>({
      context,
      path: "/builds",
      method: "POST",
      body: compactObject({
        appId: requiredInputString(input.appId, "appId"),
        workflowId: requiredInputString(input.workflowId, "workflowId"),
        branch: optionalString(input.branch),
        tag: optionalString(input.tag),
        labels: readOptionalStringArray(input.labels),
        environment: readOptionalEnvironment(input.environment),
        instanceType: optionalString(input.instanceType),
      }),
      phase: "execute",
    });

    return {
      buildId: requiredString(payload.buildId, "buildId", providerResponseError),
    };
  },

  async cancel_build(input, context) {
    const buildId = requiredInputString(input.build_id, "build_id");
    const response = await codemagicFetch({
      baseUrl: codemagicLegacyBaseUrl,
      context,
      path: `/builds/${encodeURIComponent(buildId)}/cancel`,
      method: "POST",
    });

    if (!response.ok) {
      throw await toCodemagicError(response, "execute", false, false);
    }

    return {
      ok: true,
      build_id: buildId,
      already_finished: response.status === 208,
    };
  },
};

export async function validateCodemagicApiKey(
  input: CodemagicCredentialInput,
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const context: CodemagicRuntimeContext = {
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
  };
  const payload = await requestCodemagicV3Json<{ data?: unknown }>({
    context,
    path: "/api/v3/user",
    phase: "validate",
  });

  const user = requiredRecord(payload.data, "data", providerResponseError);
  const accountId = requiredString(user.id, "id", providerResponseError);
  const displayName =
    pickFirstNonEmptyString(
      optionalString(user.full_name),
      optionalString(user.email),
      optionalString(user.username),
      optionalString(user.name),
    ) ?? "Codemagic User";

  return {
    profile: {
      accountId,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/api/v3/user",
      avatar_url: optionalString(user.avatar_url),
      email: optionalString(user.email),
      username: optionalString(user.username),
      full_name: optionalString(user.full_name),
      permissions: optionalRecord(user.permissions),
    }),
  };
}

async function requestCodemagicV3Json<T>(input: {
  context: CodemagicRuntimeContext;
  path: string;
  phase: CodemagicRequestPhase;
  method?: string;
  query?: Record<string, CodemagicQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const response = await codemagicFetch({
    baseUrl: codemagicV3BaseUrl,
    context: input.context,
    path: input.path,
    method: input.method,
    query: input.query,
    body: input.body,
  });

  if (!response.ok) {
    throw await toCodemagicError(response, input.phase, input.notFoundAsInvalidInput === true, true);
  }

  return readJsonResponse<T>(response, "codemagic");
}

async function requestCodemagicLegacyJson<T>(input: {
  context: CodemagicRuntimeContext;
  path: string;
  phase: CodemagicRequestPhase;
  method?: string;
  query?: Record<string, CodemagicQueryValue>;
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await codemagicFetch({
    baseUrl: codemagicLegacyBaseUrl,
    context: input.context,
    path: input.path,
    method: input.method,
    query: input.query,
    body: input.body,
  });

  if (!response.ok) {
    throw await toCodemagicError(response, input.phase, false, false);
  }

  return readJsonResponse<T>(response, "codemagic");
}

async function codemagicFetch(input: {
  baseUrl: string;
  context: CodemagicRuntimeContext;
  path: string;
  method?: string;
  query?: Record<string, CodemagicQueryValue>;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const url = new URL(input.path, input.baseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  try {
    return await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildCodemagicHeaders(input.context.apiKey, input.body !== undefined),
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `codemagic request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildCodemagicHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-auth-token": apiKey,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function toCodemagicError(
  response: Response,
  phase: CodemagicRequestPhase,
  notFoundAsInvalidInput: boolean,
  isV3: boolean,
): Promise<ProviderRequestError> {
  const message = await readCodemagicErrorMessage(response, isV3);

  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 502, message);
}

async function readCodemagicErrorMessage(response: Response, isV3: boolean): Promise<string> {
  try {
    const payload = requiredRecord(await response.json(), "codemagic error", providerResponseError);
    const detail = optionalString(payload.detail);
    const message = optionalString(payload.message);
    const error = optionalString(payload.error);
    if (detail || message || error) {
      return detail ?? message ?? error ?? defaultCodemagicErrorMessage(response.status, isV3);
    }
  } catch {}

  return defaultCodemagicErrorMessage(response.status, isV3);
}

function defaultCodemagicErrorMessage(status: number, isV3: boolean): string {
  const surface = isV3 ? "Codemagic v3 API" : "Codemagic legacy build API";
  return `${surface} request failed with status ${status}`;
}

async function readJsonResponse<T>(response: Response, providerName: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `${providerName} response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function requireResponsePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = readOptionalPositiveInteger(value, fieldName);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `codemagic response missing ${fieldName}`);
  }
  return parsed;
}

function readResponseArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `codemagic response missing ${fieldName}`);
  }
  return value.map((item) => requiredRecord(item, fieldName, providerResponseError));
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return requiredString(value, "cursor", providerResponseError);
}

function readOptionalPageSize(value: unknown): number | undefined {
  return readOptionalPositiveInteger(value, "page_size");
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return positiveInteger(value, fieldName, providerInputError);
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "value must be an array");
  }
  return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
}

function readOptionalEnvironment(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const input = requiredRecord(value, "environment", providerInputError);
  return compactObject({
    variables: readOptionalPrimitiveRecord(input.variables),
    groups: readOptionalStringArray(input.groups),
    softwareVersions: readOptionalStringRecord(input.softwareVersions),
  });
}

function readOptionalPrimitiveRecord(value: unknown): Record<string, string | number | boolean> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const input = requiredRecord(value, "environment.variables", providerInputError);
  return Object.fromEntries(
    Object.entries(input).map(([key, child]) => {
      if (typeof child !== "string" && typeof child !== "number" && typeof child !== "boolean") {
        throw new ProviderRequestError(400, `environment.variables.${key} must be a string, number, or boolean`);
      }
      return [key, child];
    }),
  );
}

function readOptionalStringRecord(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const input = requiredRecord(value, "environment.softwareVersions", providerInputError);
  return Object.fromEntries(
    Object.entries(input).map(([key, child]) => {
      if (typeof child !== "string") {
        throw new ProviderRequestError(400, `environment.softwareVersions.${key} must be a string`);
      }
      return [key, child];
    }),
  );
}

function pickFirstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.length > 0) {
      return value;
    }
  }
  return undefined;
}
