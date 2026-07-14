import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { MoesifActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const moesifApiBaseUrl = "https://api.moesif.com/v1";

const moesifDefaultRequestTimeoutMs = 30_000;
const defaultOrganizationId = "~";
const defaultAppId = "~";
const defaultTake = 20;

interface MoesifRequestInput {
  path: string;
  apiKey: string;
  params: Record<string, string | undefined>;
  repeatedParams?: Record<string, string[]>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
}

interface MoesifActionHandler extends ProviderRuntimeHandler<ApiKeyProviderContext> {}

interface NormalizedApp {
  id: string | null;
  name: string;
  customAppId: string | null;
  searchApiBaseUrl: string | null;
  portalApiBaseUrl: string | null;
  timeZone: string | null;
  weekStartsOn: number | null;
  secureProxy: boolean | null;
  raw: Record<string, unknown>;
}

interface NormalizedWorkspace {
  id: string | null;
  name: string | null;
  appId: string | null;
  organizationId: string | null;
  type: string | null;
  isDefault: boolean | null;
  isTemplate: boolean | null;
  viewCount: number | null;
  created: string | null;
  raw: Record<string, unknown>;
}

export const moesifActionHandlers: Record<MoesifActionName, MoesifActionHandler> = {
  async list_apps(input, context) {
    const payload = await requestMoesifJson({
      path: buildOrganizationPath(input.organizationId, "apps"),
      apiKey: context.apiKey,
      params: queryParams({
        take: readTake(input.take),
        before_id: readOptionalTrimmedString(input.beforeId),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      apps: normalizeAppList(payload),
    };
  },
  async list_workspaces(input, context) {
    const payload = await requestMoesifJson({
      path: buildOrganizationPath(input.organizationId, "workspaces"),
      apiKey: context.apiKey,
      params: queryParams({
        app_id: readOptionalTrimmedString(input.appId) ?? defaultAppId,
        take: readTake(input.take),
        before_id: readOptionalTrimmedString(input.beforeId),
      }),
      repeatedParams: {
        access: readRequiredStringList(input.access, "access"),
      },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      workspaces: normalizeWorkspaceList(payload),
    };
  },
  async get_workspace(input, context) {
    const payload = await requestMoesifJson({
      path: buildOrganizationPath(
        input.organizationId,
        "workspaces",
        readRequiredString(input.workspaceId, "workspaceId"),
      ),
      apiKey: context.apiKey,
      params: {
        app_id: readOptionalTrimmedString(input.appId) ?? defaultAppId,
      },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      workspace: normalizeWorkspace(payload),
    };
  },
  async list_workspace_templates(input, context) {
    const payload = await requestMoesifJson({
      path: buildOrganizationPath(input.organizationId, "workspaces", "templates"),
      apiKey: context.apiKey,
      params: {
        app_id: readOptionalTrimmedString(input.appId) ?? defaultAppId,
      },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      templates: normalizeWorkspaceList(payload),
    };
  },
};

export async function validateMoesifCredential(
  apiKey: string,
  fetcher: typeof fetch = providerFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMoesifJson({
    path: buildOrganizationPath(undefined, "apps"),
    apiKey: requiredString(apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    params: {
      take: "1",
    },
    fetcher,
    signal,
    phase: "validate",
  });
  const apps = normalizeAppList(payload);
  const firstApp = apps[0];

  return {
    profile: {
      accountId: firstApp?.id ?? "Moesif API Key",
      displayName: firstApp?.name ?? "Moesif API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: moesifApiBaseUrl,
      validationEndpoint: "/~/apps",
      firstAppId: firstApp?.id ?? undefined,
      firstAppName: firstApp?.name,
    }),
  };
}

async function requestMoesifJson(input: MoesifRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, moesifDefaultRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(buildMoesifUrl(input.path, input.params, input.repeatedParams), {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Moesif request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Moesif request failed: ${error.message}` : "Moesif request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readMoesifPayload(response);
  if (!response.ok) {
    throw createMoesifError(response.status, payload, input.phase);
  }
  return payload;
}

function buildMoesifUrl(
  path: string,
  params: Record<string, string | undefined>,
  repeatedParams: Record<string, string[]> = {},
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${moesifApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  for (const [key, values] of Object.entries(repeatedParams)) {
    for (const value of values) {
      url.searchParams.append(key, value);
    }
  }
  return url;
}

function buildOrganizationPath(organizationId: unknown, ...segments: string[]): string {
  return [
    encodeURIComponent(readOptionalTrimmedString(organizationId) ?? defaultOrganizationId),
    ...segments.map((segment) => encodeURIComponent(segment)),
  ].join("/");
}

async function readMoesifPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Moesif returned invalid JSON");
  }
}

function createMoesifError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractMoesifErrorMessage(payload) ?? `Moesif request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function extractMoesifErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title);
  if (directMessage) {
    return directMessage;
  }

  if (Array.isArray(record.errors)) {
    const firstError = record.errors[0];
    const firstErrorRecord = optionalRecord(firstError);
    return (
      optionalString(firstErrorRecord?.message) ??
      optionalString(firstErrorRecord?.detail) ??
      (typeof firstError === "string" ? firstError.trim() : undefined)
    );
  }

  return undefined;
}

function normalizeAppList(payload: unknown): NormalizedApp[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Moesif returned an invalid app list");
  }

  return payload.map(normalizeApp);
}

function normalizeApp(payload: unknown): NormalizedApp {
  const record = requireRecord(payload, "Moesif returned an invalid app");
  const name = optionalString(record.name);
  if (!name) {
    throw new ProviderRequestError(502, "Moesif returned an app without a name");
  }

  return {
    id: optionalString(record.id) ?? null,
    name,
    customAppId: optionalString(record.custom_app_id) ?? null,
    searchApiBaseUrl: optionalString(record.search_api_base_url) ?? null,
    portalApiBaseUrl: optionalString(record.portal_api_base_url) ?? null,
    timeZone: optionalString(record.time_zone) ?? null,
    weekStartsOn: optionalInteger(record.week_starts_on) ?? null,
    secureProxy: optionalBoolean(record.secure_proxy) ?? null,
    raw: record,
  };
}

function normalizeWorkspaceList(payload: unknown): NormalizedWorkspace[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Moesif returned an invalid workspace list");
  }

  return payload.map(normalizeWorkspace);
}

function normalizeWorkspace(payload: unknown): NormalizedWorkspace {
  const record = requireRecord(payload, "Moesif returned an invalid workspace");

  return {
    id: optionalString(record._id) ?? optionalString(record.id) ?? null,
    name: optionalString(record.name) ?? null,
    appId: optionalString(record.app_id) ?? null,
    organizationId: optionalString(record.org_id) ?? null,
    type: optionalString(record.type) ?? null,
    isDefault: optionalBoolean(record.is_default) ?? null,
    isTemplate: optionalBoolean(record.is_template) ?? null,
    viewCount: optionalInteger(record.view_count) ?? null,
    created: optionalString(record.created) ?? null,
    raw: record,
  };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readTake(value: unknown): number {
  return optionalInteger(value) ?? defaultTake;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}

function readRequiredStringList(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a string array`);
  }

  const values = value
    .map((item) => readOptionalTrimmedString(item))
    .filter((item): item is string => item !== undefined);
  if (values.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must include at least one value`);
  }
  return values;
}
