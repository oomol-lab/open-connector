import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

export const confluenceValidationPath = "/spaces";
export const confluenceDefaultTimeoutMs = 30_000;
const defaultLimit = 25;
const atlassianApiOrigin = "https://api.atlassian.com";

export type ConfluencePhase = "validate" | "execute";

export interface ConfluenceBasicAuth {
  type: "basic";
  email?: unknown;
  apiToken: string;
}

export interface ConfluenceOAuthAuth {
  type: "oauth2";
  accessToken: string;
  tokenType: string;
}

type ConfluenceAuth = ConfluenceBasicAuth | ConfluenceOAuthAuth;

export interface ConfluenceContext {
  baseUrl?: unknown;
  restApiBaseUrl?: unknown;
  auth: ConfluenceAuth;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export interface ConfluenceApiBaseUrls {
  baseUrl: string;
  restApiBaseUrl: string;
}

export interface ConfluenceRequestInput extends ConfluenceContext {
  method: "GET" | "POST" | "PUT";
  path: string;
  phase: ConfluencePhase;
  apiVersion?: "v1" | "v2";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}

type ConfluenceActionHandler = (input: Record<string, unknown>, context: ConfluenceContext) => Promise<unknown>;

export const confluenceActionHandlers: ProviderActionHandlers<"confluence", ConfluenceActionHandler> = {
  async search_content(input, context): Promise<unknown> {
    const payload = await requestConfluenceJson({
      ...context,
      method: "GET",
      path: "/search",
      phase: "execute",
      apiVersion: "v1",
      query: compactObject({
        cql: requiredInputString(input.cql, "cql"),
        limit: optionalInteger(input.limit) ?? defaultLimit,
        cursor: optionalString(input.cursor),
      }),
    });
    return normalizeSearchResponse(payload);
  },
  async list_spaces(input, context): Promise<unknown> {
    const payload = await requestConfluenceJson({
      ...context,
      method: "GET",
      path: "/spaces",
      phase: "execute",
      query: compactObject({
        limit: optionalInteger(input.limit) ?? defaultLimit,
        cursor: optionalString(input.cursor),
        type: optionalString(input.type),
        status: optionalString(input.status),
      }),
    });
    return normalizeSpacesResponse(payload);
  },
  async get_page(input, context): Promise<unknown> {
    const payload = await requestConfluenceJson({
      ...context,
      method: "GET",
      path: `/pages/${encodeURIComponent(requiredInputString(input.pageId, "pageId"))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        "body-format": optionalString(input.bodyFormat),
      }),
    });
    return { page: normalizePage(payload) };
  },
  async create_page(input, context): Promise<unknown> {
    const payload = await requestConfluenceJson({
      ...context,
      method: "POST",
      path: "/pages",
      phase: "execute",
      body: compactObject({
        spaceId: requiredInputString(input.spaceId, "spaceId"),
        status: optionalString(input.status) ?? "current",
        title: requiredInputString(input.title, "title"),
        parentId: optionalString(input.parentId),
        body: buildPageBody(input),
      }),
    });
    return { page: normalizePage(payload) };
  },
  async update_page(input, context): Promise<unknown> {
    const payload = await requestConfluenceJson({
      ...context,
      method: "PUT",
      path: `/pages/${encodeURIComponent(requiredInputString(input.pageId, "pageId"))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: compactObject({
        id: requiredInputString(input.pageId, "pageId"),
        status: optionalString(input.status) ?? "current",
        title: requiredInputString(input.title, "title"),
        body: buildOptionalPageBody(input),
        version: compactObject({
          number: optionalInteger(input.versionNumber),
          message: optionalString(input.versionMessage),
          minorEdit: optionalBoolean(input.minorEdit),
        }),
      }),
    });
    return { page: normalizePage(payload) };
  },
};

export async function validateConfluenceCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiToken = requiredString(input.apiKey, "apiKey", providerInputError);
  const email = requiredString(input.email, "email", providerInputError);
  const siteUrl = normalizeConfluenceSiteUrl(requiredString(input.siteUrl, "siteUrl", providerInputError));
  const { baseUrl, restApiBaseUrl } = buildConfluenceSiteApiBaseUrls(siteUrl);

  const payload = await requestConfluenceJson({
    baseUrl,
    restApiBaseUrl,
    auth: {
      type: "basic",
      email,
      apiToken,
    },
    fetcher,
    signal,
    method: "GET",
    path: confluenceValidationPath,
    phase: "validate",
    query: { limit: 1 },
  });
  const payloadObject = optionalRecord(payload);
  const resultCount = Array.isArray(payloadObject?.results) ? payloadObject.results.length : undefined;
  const host = new URL(siteUrl).host;

  return {
    profile: {
      accountId: `confluence:${host}:${email}`,
      displayName: `${email} (${host})`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      siteUrl,
      baseUrl,
      restApiBaseUrl,
      email,
      validationEndpoint: confluenceValidationPath,
      validationResultCount: resultCount,
    }),
  };
}

/** Build Atlassian's tenant-routed Confluence REST endpoints for one OAuth cloud site. */
export function buildConfluenceOAuthApiBaseUrls(cloudId: string): ConfluenceApiBaseUrls {
  const encodedCloudId = encodeURIComponent(requiredString(cloudId, "cloudId", providerInputError));
  const tenantBaseUrl = `${atlassianApiOrigin}/ex/confluence/${encodedCloudId}/wiki`;
  return {
    baseUrl: `${tenantBaseUrl}/api/v2`,
    restApiBaseUrl: `${tenantBaseUrl}/rest/api`,
  };
}

function buildConfluenceSiteApiBaseUrls(siteUrl: string): ConfluenceApiBaseUrls {
  return {
    baseUrl: `${siteUrl}/wiki/api/v2`,
    restApiBaseUrl: `${siteUrl}/wiki/rest/api`,
  };
}

function resolveConfluenceBaseUrl(context: ConfluenceContext, apiVersion: "v1" | "v2"): string {
  if (apiVersion === "v1") {
    const restApiBaseUrl = optionalString(context.restApiBaseUrl);
    if (restApiBaseUrl) {
      return trimTrailingSlash(restApiBaseUrl);
    }
  }
  const baseUrl = optionalString(context.baseUrl);
  if (baseUrl) {
    const normalizedBaseUrl = trimTrailingSlash(baseUrl);
    if (apiVersion === "v2") {
      return normalizedBaseUrl;
    }
    const derivedRestApiBaseUrl = normalizedBaseUrl.replace(/\/wiki\/api\/v2$/u, "/wiki/rest/api");
    if (derivedRestApiBaseUrl !== normalizedBaseUrl) {
      return derivedRestApiBaseUrl;
    }
    throw new ProviderRequestError(400, "Confluence REST v1 base URL is unavailable");
  }
  throw new ProviderRequestError(400, "Confluence siteUrl is required");
}

function resolveConfluenceEmail(auth: ConfluenceBasicAuth): string {
  const email = optionalString(auth.email);
  if (email) {
    return email;
  }
  throw new ProviderRequestError(400, "Confluence email is required");
}

function normalizeConfluenceSiteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new ProviderRequestError(400, "Confluence siteUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Confluence siteUrl must use https");
  }
  if (!url.hostname.endsWith(".atlassian.net")) {
    throw new ProviderRequestError(400, "Confluence siteUrl must be an atlassian.net Cloud site");
  }

  return `https://${url.hostname}`;
}

export async function requestConfluenceJson(input: ConfluenceRequestInput): Promise<unknown> {
  const baseUrl = resolveConfluenceBaseUrl(input, input.apiVersion ?? "v2");
  const url = new URL(input.path.replace(/^\//, ""), `${trimTrailingSlash(baseUrl)}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal, confluenceDefaultTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: confluenceHeaders(input),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readConfluencePayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Confluence request timed out after ${Math.ceil(confluenceDefaultTimeoutMs / 1000)} seconds`,
      );
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Confluence request failed: ${error.message}` : "Confluence request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createConfluenceError(response, payload, input.phase, input.notFoundAsInvalidInput === true);
  }

  return payload;
}

function confluenceHeaders(input: ConfluenceRequestInput): Record<string, string> {
  const authorization =
    input.auth.type === "oauth2"
      ? `${input.auth.tokenType} ${input.auth.accessToken}`
      : `Basic ${Buffer.from(`${resolveConfluenceEmail(input.auth)}:${input.auth.apiToken}`).toString("base64")}`;
  const headers: Record<string, string> = {
    Authorization: authorization,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function readConfluencePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createConfluenceError(
  response: Response,
  payload: unknown,
  phase: ConfluencePhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractConfluenceErrorMessage(payload) ?? response.statusText ?? "Confluence request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(404, message);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractConfluenceErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  return (
    optionalString(object?.message) ??
    optionalString(object?.errorMessage) ??
    optionalString(object?.error) ??
    readFirstMessage(object?.errors)
  );
}

function readFirstMessage(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const item of value) {
    const message = optionalString(optionalRecord(item)?.message);
    if (message) {
      return message;
    }
  }
  return undefined;
}

function normalizeSpacesResponse(payload: unknown): Record<string, unknown> {
  const object = requireObject(payload, "Confluence spaces response must be an object");
  const results = Array.isArray(object.results) ? object.results : [];
  return {
    spaces: results.map(normalizeSpace),
    pagination: {
      nextCursor: readNextCursor(object),
    },
  };
}

function normalizeSearchResponse(payload: unknown): Record<string, unknown> {
  const object = requireObject(payload, "Confluence search response must be an object");
  const results = Array.isArray(object.results) ? object.results : [];
  return {
    results: results.map(normalizeSearchResult),
    pagination: {
      nextCursor: readNextCursor(object),
    },
  };
}

function normalizeSpace(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "Confluence space must be an object");
  return compactObject({
    id: optionalString(object.id),
    key: optionalString(object.key),
    name: optionalString(object.name),
    type: optionalString(object.type),
    status: optionalString(object.status),
    homepageId: optionalString(object.homepageId ?? optionalRecord(object.homepage)?.id) ?? null,
    raw: object,
  });
}

function normalizePage(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "Confluence page must be an object");
  const version = optionalRecord(object.version);
  return compactObject({
    id: optionalString(object.id),
    status: optionalString(object.status),
    title: optionalString(object.title),
    spaceId: optionalString(object.spaceId),
    parentId: optionalString(object.parentId) ?? null,
    createdAt: optionalString(object.createdAt),
    version: version
      ? compactObject({
          number: optionalInteger(version.number),
          message: optionalString(version.message),
          minorEdit: optionalBoolean(version.minorEdit),
        })
      : null,
    body: optionalRecord(object.body) ?? null,
    raw: object,
  });
}

function normalizeSearchResult(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "Confluence search result must be an object");
  const content = optionalRecord(object.content);
  const resultGlobalContainer = optionalRecord(object.resultGlobalContainer);
  return compactObject({
    id: optionalString(object.id ?? content?.id),
    type: optionalString(object.type ?? content?.type),
    title: optionalString(object.title ?? content?.title),
    url: optionalString(object.url ?? object.webUrl ?? object.link),
    excerpt: optionalString(object.excerpt),
    containerTitle: optionalString(resultGlobalContainer?.title),
    raw: object,
  });
}

function readNextCursor(payload: Record<string, unknown>): string | null {
  const cursor = optionalString(payload._links && optionalRecord(payload._links)?.next);
  if (!cursor) {
    return null;
  }
  const questionIndex = cursor.indexOf("?");
  const search = questionIndex >= 0 ? cursor.slice(questionIndex) : cursor;
  try {
    return new URLSearchParams(search).get("cursor");
  } catch {
    return null;
  }
}

function buildPageBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    representation: optionalString(input.bodyRepresentation) ?? "storage",
    value: requiredInputString(input.body, "body"),
  };
}

function buildOptionalPageBody(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const body = optionalString(input.body);
  if (!body) {
    return undefined;
  }
  return {
    representation: optionalString(input.bodyRepresentation) ?? "storage",
    value: body,
  };
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
