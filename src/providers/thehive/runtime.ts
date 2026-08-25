import type { CredentialValidationResult } from "../../core/types.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export type TheHiveVersion = 4 | 5;

export interface TheHiveRuntimeConfig {
  displayName: string;
  service: "thehive" | "thehive5";
  version: TheHiveVersion;
}

export interface TheHiveContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type TheHiveActionHandler = (input: Record<string, unknown>, context: TheHiveContext) => Promise<unknown>;

export function createTheHiveActionHandlers(config: TheHiveRuntimeConfig): Record<string, TheHiveActionHandler> {
  return {
    async create_alert(input, context) {
      const payload = await request(context, config, alertPath(config.version), { method: "POST", body: input });
      return { alert: requireEntity(payload, config.displayName, "alert") };
    },
    async get_alert(input, context) {
      const alertId = requiredString(input.alertId, "alertId", providerInputError);
      const payload = await request(context, config, `${alertPath(config.version)}/${encodeURIComponent(alertId)}`, {
        notFound: true,
      });
      return { alert: requireEntity(payload, config.displayName, "alert") };
    },
    async list_alerts(input, context) {
      const result = await listEntities(input, context, config, "listAlert");
      return { alerts: result.items, offset: result.offset, limit: result.limit, nextOffset: result.nextOffset };
    },
    async create_case(input, context) {
      const payload = await request(context, config, casePath(config.version), { method: "POST", body: input });
      return { case: requireEntity(payload, config.displayName, "case") };
    },
    async get_case(input, context) {
      const caseId = requiredString(input.caseId, "caseId", providerInputError);
      const payload = await request(context, config, `${casePath(config.version)}/${encodeURIComponent(caseId)}`, {
        notFound: true,
      });
      return { case: requireEntity(payload, config.displayName, "case") };
    },
    async list_cases(input, context) {
      const result = await listEntities(input, context, config, "listCase");
      return { cases: result.items, offset: result.offset, limit: result.limit, nextOffset: result.nextOffset };
    },
  };
}

export function createTheHiveContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): TheHiveContext {
  return { apiKey, baseUrl: normalizeTheHiveBaseUrl(values.baseUrl), fetcher, signal };
}

export async function validateTheHiveCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  config: TheHiveRuntimeConfig,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizeTheHiveBaseUrl(values.baseUrl);
  const context: TheHiveContext = { apiKey, baseUrl, fetcher, signal };
  const user = requireEntity(
    await request(context, config, "/api/v1/user/current", { phase: "validate" }),
    config.displayName,
    "user",
  );
  const host = new URL(baseUrl).host;
  const userId = optionalString(user._id) ?? optionalString(user.login) ?? "current";
  const accountName = optionalString(user.name) ?? optionalString(user.login) ?? host;
  return {
    profile: {
      accountId: `${config.service}:${host}:${userId}`,
      displayName: `${accountName} (${host})`,
    },
    grantedScopes: [],
    metadata: {
      baseUrl,
      apiBaseUrl: `${baseUrl}/api${config.version == 5 ? "/v1" : ""}`,
      validationEndpoint: "/api/v1/user/current",
      version: config.version,
    },
  };
}

export function normalizeTheHiveBaseUrl(value: unknown): string {
  const url = assertPublicHttpUrl(requiredString(value, "baseUrl", providerInputError), {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.username || url.password) throw providerInputError("baseUrl must not include credentials");
  if (url.pathname != "/") throw providerInputError("baseUrl must be the TheHive instance root URL without a path");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function alertPath(version: TheHiveVersion): string {
  return version == 5 ? "/api/v1/alert" : "/api/alert";
}

function casePath(version: TheHiveVersion): string {
  return version == 5 ? "/api/v1/case" : "/api/case";
}

async function listEntities(
  input: Record<string, unknown>,
  context: TheHiveContext,
  config: TheHiveRuntimeConfig,
  queryName: "listAlert" | "listCase",
): Promise<{ items: unknown[]; offset: number; limit: number; nextOffset: number | null }> {
  const limit = typeof input.limit == "number" ? input.limit : 100;
  const offset = typeof input.offset == "number" ? input.offset : 0;
  const payload = await request(context, config, "/api/v1/query", {
    method: "POST",
    body: { query: [{ _name: queryName }, { _name: "page", from: offset, to: offset + limit }] },
  });
  if (!Array.isArray(payload) || !payload.every((item) => optionalRecord(item))) {
    throw new ProviderRequestError(502, `${config.displayName} query response is not an entity array`, payload);
  }
  return {
    items: payload,
    offset,
    limit,
    nextOffset: payload.length == limit ? offset + payload.length : null,
  };
}

interface TheHiveRequestOptions {
  method?: "POST";
  body?: unknown;
  notFound?: boolean;
  phase?: "validate" | "execute";
}

async function request(
  context: TheHiveContext,
  config: TheHiveRuntimeConfig,
  path: string,
  options: TheHiveRequestOptions = {},
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, 30_000);
  const url = new URL(path, `${context.baseUrl}/`);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw mapError(response.status, payload, options.phase ?? "execute", config.displayName, options.notFound);
    }
    return payload;
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `${config.displayName} request timed out`);
    }
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `${config.displayName} request failed: ${error.message}`
        : `${config.displayName} request failed`,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status == 204) return {};
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
  displayName: string,
  notFound?: boolean,
): ProviderRequestError {
  const object = optionalRecord(payload) ?? {};
  const message =
    optionalString(object.message) ??
    optionalString(object.error) ??
    `${displayName} request failed with status ${status}`;
  if (status == 401 || status == 403) return new ProviderRequestError(phase == "validate" ? 400 : status, message);
  if (status == 404 && notFound) return new ProviderRequestError(400, message);
  if (status == 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function requireEntity(payload: unknown, displayName: string, kind: string): Record<string, unknown> {
  const entity = optionalRecord(payload);
  if (!entity) throw new ProviderRequestError(502, `${displayName} response is missing the ${kind} object`, payload);
  return entity;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
