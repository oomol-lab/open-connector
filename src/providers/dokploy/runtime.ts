import type { CredentialValidationResult } from "../../core/types.ts";
import type { DokployActionName } from "./actions.ts";

import { optionalIntegerLike, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, queryParams } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type DokployRequestPhase = "validate" | "execute";
type DokployActionHandler = (input: Record<string, unknown>, context: DokployActionContext) => Promise<unknown>;

interface DokployRequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown>;
}

export interface DokployActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const dokployActionHandlers: Record<DokployActionName, DokployActionHandler> = {
  async search_projects(input, context) {
    const payload = requireObject(
      await dokployRequestJson("/project.search", context, "execute", {
        query: searchQuery(input),
      }),
      "project search",
    );
    return {
      projects: requireArray(payload.items, "project search items"),
      total: requireNumber(payload.total, "project search total"),
    };
  },
  async get_project(input, context) {
    return requireObject(
      await dokployRequestJson("/project.one", context, "execute", {
        query: { projectId: requiredString(input.projectId, "projectId", inputError) },
      }),
      "project",
    );
  },
  async search_applications(input, context) {
    const payload = requireObject(
      await dokployRequestJson("/application.search", context, "execute", {
        query: {
          ...searchQuery(input),
          appName: optionalString(input.appName),
          repository: optionalString(input.repository),
          owner: optionalString(input.owner),
          dockerImage: optionalString(input.dockerImage),
          projectId: optionalString(input.projectId),
          environmentId: optionalString(input.environmentId),
        },
      }),
      "application search",
    );
    return {
      applications: requireArray(payload.items, "application search items"),
      total: requireNumber(payload.total, "application search total"),
    };
  },
  async get_application(input, context) {
    return requireObject(
      await dokployRequestJson("/application.one", context, "execute", {
        query: { applicationId: requiredString(input.applicationId, "applicationId", inputError) },
      }),
      "application",
    );
  },
  async list_application_deployments(input, context) {
    const payload = await dokployRequestJson("/deployment.all", context, "execute", {
      query: { applicationId: requiredString(input.applicationId, "applicationId", inputError) },
    });
    return { deployments: requireArray(payload, "deployment history") };
  },
  async deploy_application(input, context) {
    await dokployRequestJson("/application.deploy", context, "execute", {
      method: "POST",
      body: {
        applicationId: requiredString(input.applicationId, "applicationId", inputError),
        title: optionalString(input.title),
        description: optionalString(input.description),
      },
    });
    return { accepted: true };
  },
};

export function createDokployContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): DokployActionContext {
  return {
    apiKey,
    apiBaseUrl: normalizeDokployApiBaseUrl(values.baseUrl),
    fetcher,
    signal,
  };
}

export async function validateDokployCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createDokployContext(values, apiKey, fetcher, signal);
  await dokployRequestJson("/project.search", context, "validate", {
    query: { limit: 1, offset: 0 },
  });
  const host = new URL(context.apiBaseUrl).host;
  return {
    profile: {
      accountId: `dokploy:${host}`,
      displayName: `Dokploy ${host}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: context.apiBaseUrl,
      validationEndpoint: "/project.search",
    },
  };
}

export function normalizeDokployApiBaseUrl(value: unknown): string {
  const instanceUrl = requiredString(value, "baseUrl", credentialError);
  const url = assertPublicHttpUrl(instanceUrl, { fieldName: "baseUrl", createError: credentialError });
  if (url.username || url.password) {
    throw credentialError("baseUrl must not include credentials");
  }
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/u, "");
  url.pathname = path.endsWith("/api") ? path : `${path}/api`;
  return url.toString().replace(/\/$/u, "");
}

function searchQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    q: optionalString(input.query),
    name: optionalString(input.name),
    description: optionalString(input.description),
    limit: optionalIntegerLike(input.limit, "limit", inputError),
    offset: optionalIntegerLike(input.offset, "offset", inputError),
  };
}

async function dokployRequestJson(
  path: string,
  context: DokployActionContext,
  phase: DokployRequestPhase,
  options: DokployRequestOptions = {},
): Promise<unknown> {
  const url = new URL(`${context.apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams(options.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      body: options.body ? JSON.stringify(removeUndefined(options.body)) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dokploy request failed: ${error.message}` : "Dokploy request failed",
    );
  }

  const text = await response.text().catch(() => "");
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) throw new ProviderRequestError(502, "Dokploy returned invalid JSON");
    }
  }
  if (!response.ok) {
    const message = readErrorMessage(payload) ?? (text || `Dokploy request failed with HTTP ${response.status}`);
    const status = phase === "validate" && [400, 401, 403].includes(response.status) ? 400 : response.status;
    throw new ProviderRequestError(status, message, payload);
  }
  return payload;
}

function removeUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `Dokploy ${label} response is not an object`, value);
  return record;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Dokploy ${label} response is not an array`, value);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(502, `Dokploy ${label} response is not a number`, value);
  }
  return value;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
