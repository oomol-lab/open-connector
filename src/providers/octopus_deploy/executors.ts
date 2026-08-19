import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "octopus_deploy";
const validationPath = "/users/me";
const requestTimeoutMs = 30_000;
const maxResponseBytes = 10 * 1024 * 1024;

interface OctopusDeployContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type OctopusDeployActionHandler = (input: Record<string, unknown>, context: OctopusDeployContext) => Promise<unknown>;

export const octopusDeployActionHandlers: ProviderActionHandlers<"octopus_deploy", OctopusDeployActionHandler> = {
  async get_current_user(_input, context) {
    const raw = await requestOctopusDeployObject(context, validationPath, "execute");
    return { user: raw, raw };
  },
  list_spaces(input, context) {
    return listCollection(context, "/spaces", pickQuery(input, ["ids", "name", "partialName", "skip", "take"]));
  },
  list_projects(input, context) {
    return listCollection(
      context,
      buildSpacePath(input, "/projects"),
      pickQuery(input, ["ids", "partialName", "skip", "take"]),
    );
  },
  get_project(input, context) {
    return getResource(context, buildSpacePath(input, `/projects/${readPathId(input)}`));
  },
  list_environments(input, context) {
    return listCollection(
      context,
      buildSpacePath(input, "/environments"),
      pickQuery(input, ["ids", "partialName", "skip", "take"]),
    );
  },
  get_environment(input, context) {
    return getResource(context, buildSpacePath(input, `/environments/${readPathId(input)}`));
  },
  list_releases(input, context) {
    return listCollection(context, buildSpacePath(input, "/releases"), pickQuery(input, ["skip", "take"]));
  },
  get_release(input, context) {
    return getResource(context, buildSpacePath(input, `/releases/${readPathId(input)}`));
  },
  list_deployments(input, context) {
    return listCollection(
      context,
      buildSpacePath(input, "/deployments"),
      pickQuery(input, [
        "channels",
        "environments",
        "ids",
        "partialName",
        "projects",
        "skip",
        "take",
        "taskState",
        "tenants",
      ]),
    );
  },
  get_deployment(input, context) {
    return getResource(context, buildSpacePath(input, `/deployments/${readPathId(input)}`));
  },
  list_tasks(input, context) {
    return listCollection(
      context,
      buildSpacePath(input, "/tasks"),
      pickQuery(input, [
        "active",
        "batch",
        "description",
        "environment",
        "fromCompletedDate",
        "fromQueueDate",
        "fromStartDate",
        "hasPendingInterruptions",
        "hasPendingPreconditions",
        "hasWarningsOrErrors",
        "ids",
        "name",
        "node",
        "partialName",
        "project",
        "runbook",
        "running",
        "skip",
        "states",
        "take",
        "tenant",
        "tenantTag",
        "toCompletedDate",
        "toQueueDate",
        "toStartDate",
      ]),
    );
  },
  get_task(input, context) {
    return getResource(context, buildSpacePath(input, `/tasks/${readPathId(input)}`));
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OctopusDeployContext>({
  service,
  handlers: octopusDeployActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher): Promise<OctopusDeployContext> {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.metadata.apiBaseUrl) ?? optionalString(credential.values.baseUrl);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizeApiBaseUrl(baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeApiBaseUrl(
      optionalString(credential.metadata.apiBaseUrl) ?? optionalString(credential.values.baseUrl),
    );
  },
  auth: { type: "api_key_header", name: "X-Octopus-ApiKey" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiBaseUrl = normalizeApiBaseUrl(input.values.baseUrl);
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    const raw = await requestOctopusDeployObject(
      { apiKey: input.apiKey, apiBaseUrl, fetcher: guardedFetcher, signal },
      validationPath,
      "validate",
    );
    const userId = optionalString(raw.Id);
    return {
      profile: {
        accountId: userId
          ? `octopus_deploy:${createHash("sha256").update(apiBaseUrl).digest("hex").slice(0, 12)}:${userId}`
          : createHash("sha256").update(apiBaseUrl).digest("hex").slice(0, 12),
        displayName:
          optionalString(raw.DisplayName) ??
          optionalString(raw.Username) ??
          optionalString(raw.EmailAddress) ??
          "Octopus Deploy API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        baseUrl: apiBaseUrl,
        validationEndpoint: validationPath,
        userId,
        username: optionalString(raw.Username),
        email: optionalString(raw.EmailAddress),
      }),
    };
  },
};

async function listCollection(
  context: OctopusDeployContext,
  path: string,
  query?: Record<string, unknown>,
): Promise<unknown> {
  const raw = await requestOctopusDeployObject(context, path, "execute", query);
  return {
    items: Array.isArray(raw.Items) ? raw.Items.filter((item) => optionalRecord(item) !== undefined) : [],
    pagination: compactObject({
      totalResults: optionalNumber(raw.TotalResults),
      itemsPerPage: optionalNumber(raw.ItemsPerPage),
      numberOfPages: optionalNumber(raw.NumberOfPages),
      lastPageNumber: optionalNumber(raw.LastPageNumber),
      links: optionalRecord(raw.Links) ?? {},
    }),
    raw,
  };
}

async function getResource(context: OctopusDeployContext, path: string): Promise<unknown> {
  const raw = await requestOctopusDeployObject(context, path, "execute");
  return { resource: raw, raw };
}

async function requestOctopusDeployObject(
  context: OctopusDeployContext,
  path: string,
  phase: "validate" | "execute",
  query?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = new URL(path.replace(/^\/+/, ""), `${context.apiBaseUrl}/`);
  appendQuery(url, query);
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-Octopus-ApiKey": context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw mapHttpError(response.status, readErrorMessage(payload), phase);
    }
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Octopus Deploy returned a non-object JSON payload");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Octopus Deploy request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Octopus Deploy request failed: ${error.message}` : "Octopus Deploy request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeApiBaseUrl(value: unknown): string {
  const raw = requiredString(value, "baseUrl", providerInputError);
  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
    createError: providerInputError,
  });
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include credentials");
  }
  url.search = "";
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/api") ? path : `${path}/api`;
  return url.toString().replace(/\/+$/, "");
}

function buildSpacePath(input: Record<string, unknown>, childPath: string): string {
  const spaceIdentifier = requiredString(input.spaceIdentifier, "spaceIdentifier", providerInputError);
  return `/spaces/${encodeURIComponent(spaceIdentifier)}${childPath}`;
}

function readPathId(input: Record<string, unknown>): string {
  return encodeURIComponent(requiredString(input.id, "id", providerInputError));
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, input[key]]));
}

function appendQuery(url: URL, query?: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Octopus Deploy response", maxResponseBytes);
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function readErrorMessage(payload: unknown): string {
  const record = optionalRecord(payload);
  return (
    optionalString(record?.ErrorMessage) ??
    optionalString(record?.Message) ??
    optionalString(record?.message) ??
    "Octopus Deploy request failed"
  );
}

function mapHttpError(status: number, message: string, phase: "validate" | "execute"): ProviderRequestError {
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (status === 401 || status === 403 || (phase === "validate" && status === 404)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message.endsWith(".") ? message.slice(0, -1) : message);
}
