import type {
  ExecutionContext,
  ProviderProxyExecutor,
  ProxyExecutionResult,
  ProxyRequestInput,
  ProxyResponse,
  ResolvedCredential,
} from "../core/types.ts";

import { Buffer } from "node:buffer";
import { optionalRecord, optionalScalarString, optionalString, requiredString } from "../core/cast.ts";
import { readBoundedResponseBytes } from "../core/request.ts";
import {
  requireApiKeyCredential,
  requireOAuthCredential,
  requireCustomCredential,
  requireBearerCredential,
} from "./provider-credentials.ts";
import {
  createProviderFetch,
  providerUserAgent,
  ProviderRequestError,
  basicAuthorizationHeader,
  createProviderTimeout,
  readProviderErrorTextBody,
  toProviderExecutionError,
} from "./provider-runtime.ts";

export type ProviderProxyCredentialHeaderSource =
  | { type: "api_key" }
  | { type: "credential_value"; name: string }
  | { type: "credential_metadata"; name: string };

export interface ProviderProxyCredentialHeader {
  name: string;
  source: ProviderProxyCredentialHeaderSource;
  prefix?: string;
  suffix?: string;
  optional?: boolean;
}

export interface ProviderProxyBearerResolverInput {
  context: ExecutionContext;
  service: string;
  /** Guarded fetch used for provider-owned auxiliary requests such as token minting. */
  fetcher: typeof fetch;
  /** Caller signal from the proxy request context; aborts in-flight token minting. */
  signal?: AbortSignal;
}

export interface ProviderProxyBearerResolution {
  accessToken: string;
  tokenType?: string;
}

export type ProviderProxyAuth =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "oauth_bearer" }
  | { type: "oauth_query"; name: string }
  | { type: "api_key_header"; name: string }
  | { type: "api_key_query"; name: string }
  | { type: "optional_api_key_header"; name: string; prefix?: string }
  | { type: "optional_api_key_query"; name: string }
  | { type: "api_key_json_body"; name: string }
  | { type: "api_key_query_or_json_body"; name: string; bodyMethods?: readonly string[] }
  | { type: "api_key_query_or_form_body"; name: string; bodyMethods?: readonly string[] }
  | { type: "api_key_basic"; suffix?: string }
  | { type: "api_key_authorization"; prefix: string; suffix?: string }
  | { type: "custom_credential_header"; field: string; name: string; prefix?: string }
  | { type: "credential_headers"; headers: readonly ProviderProxyCredentialHeader[] }
  | {
      /** Resolve a bearer token for providers that mint one from a stored credential at request time. */
      type: "bearer_resolver";
      resolve(input: ProviderProxyBearerResolverInput): Promise<ProviderProxyBearerResolution>;
    };

export type ProviderProxyBaseUrlResolver = (context: ExecutionContext, service: string) => Promise<string> | string;

export type ProviderProxyBaseUrl = string | ProviderProxyBaseUrlResolver;

export interface ProviderProxyRequestCustomizationInput {
  context: ExecutionContext;
  service: string;
  endpoint: string;
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
  setBody(body: unknown): void;
  credential?: ResolvedCredential;
  /** Guarded fetcher used by the proxy for provider-owned auxiliary requests such as token exchange. */
  fetcher: typeof fetch;
}

export interface ProviderProxyDefinition {
  service: string;
  baseUrl: ProviderProxyBaseUrl;
  auth: ProviderProxyAuth;
  allowedEndpoint?: (endpoint: string) => boolean;
  customizeRequest?: (input: ProviderProxyRequestCustomizationInput) => Promise<void> | void;
  /** Parse a failed HTTP response using the same provider error rules as actions. */
  readError?: (response: Response) => Promise<ProviderRequestError>;
  /** Provider-specific credential/signature headers that redirects must not forward cross-origin. */
  sensitiveHeaders?: readonly string[];
  /** Exact code-controlled origins that `customizeRequest` may select in addition to the resolved base origin. */
  allowedOrigins?: readonly string[];
  /** Deployment-gated private-network opt-in applied to this proxy's egress fetch (currently Dokploy). */
  allowPrivateNetwork?: () => boolean;
  /** Skip the redundant DNS resolved-address check; only for hardcoded-base-URL proxies. */
  skipDnsValidation?: boolean;
  /** Deliberate provider-specific timeout override; defaults to the shared 30-second budget. */
  timeoutMs?: number;
  /** Native redirect policy override; guarded manual following remains the default. */
  redirect?: RequestRedirect;
  /** Deliberate provider-specific response byte cap; defaults to the shared 20 MiB limit. */
  maxResponseBytes?: number;
}

const blockedProxyRequestHeaders = new Set([
  "authorization",
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
]);

const defaultProviderProxyMaxResponseBytes = 20 * 1024 * 1024;

export function createProviderProxyUrl(
  baseUrl: string,
  endpointInput: unknown,
  queryInput?: unknown,
  allowedOrigins?: readonly string[],
): URL {
  const endpoint = normalizeProviderProxyEndpoint(endpointInput, allowedOrigins);
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const url = endpoint.startsWith("/") ? new URL(`./${endpoint.slice(1)}`, base) : new URL(endpoint);
  for (const [key, value] of Object.entries(normalizeProviderProxyQuery(queryInput))) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function normalizeProviderProxyEndpoint(endpointInput: unknown, allowedOrigins?: readonly string[]): string {
  const endpoint = requiredString(endpointInput, "endpoint", (message) => new ProviderRequestError(400, message));
  if (!endpoint.startsWith("/") || endpoint.startsWith("//")) {
    let absolute: URL;
    try {
      absolute = new URL(endpoint);
    } catch {
      throw new ProviderRequestError(400, "endpoint must be a relative path or an allowed absolute HTTPS URL");
    }
    const origins = new Set(allowedOrigins?.map((value) => new URL(value).origin));
    if (absolute.protocol !== "https:" || absolute.username || absolute.password || !origins.has(absolute.origin)) {
      throw new ProviderRequestError(400, "absolute endpoint origin is not allowed");
    }
    if (endpoint.includes("\\") || hasPathTraversalSegment(absolute.pathname)) {
      throw new ProviderRequestError(400, "endpoint must not contain path traversal segments");
    }
    return absolute.toString();
  }
  try {
    const url = new URL(endpoint.slice(1));
    if (url.protocol === "http:" || url.protocol === "https:") {
      throw new ProviderRequestError(400, "endpoint must be a relative path");
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
  }
  if (endpoint.includes("\\") || hasPathTraversalSegment(endpoint)) {
    throw new ProviderRequestError(400, "endpoint must not contain path traversal segments");
  }
  return endpoint;
}

function hasPathTraversalSegment(endpoint: string): boolean {
  const path = endpoint.split(/[?#]/u)[0]!;
  for (const segment of path.split("/")) {
    try {
      if (decodeURIComponent(segment) === "..") {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

export function normalizeProviderProxyQuery(queryInput: unknown): Record<string, string> {
  const query = optionalRecord(queryInput);
  if (!query) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    const scalar = optionalScalarString(value);
    if (scalar !== undefined) {
      output[key] = scalar;
    }
  }
  return output;
}

export function normalizeProviderProxyHeaders(headersInput: unknown): Headers {
  const headers = new Headers();
  const input = optionalRecord(headersInput);
  if (!input) {
    return headers;
  }

  for (const [name, value] of Object.entries(input)) {
    const normalizedName = name.toLowerCase();
    const headerValue = optionalString(value);
    if (headerValue && !blockedProxyRequestHeaders.has(normalizedName)) {
      headers.set(normalizedName, headerValue);
    }
  }
  return headers;
}

export interface ReadProviderProxyResponseOptions {
  maxBytes?: number;
}

export async function readProviderProxyResponse(
  response: Response,
  options: ReadProviderProxyResponseOptions = {},
): Promise<ProxyResponse> {
  const headers = Object.fromEntries(response.headers.entries());
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: options.maxBytes ?? defaultProviderProxyMaxResponseBytes,
    fieldName: "proxy response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const normalizedContentType = contentType.split(";", 1)[0]!.trim().toLowerCase();
  if (bytes.byteLength === 0) {
    return {
      status: response.status,
      headers,
      data: null,
    };
  }
  if (!normalizedContentType) {
    try {
      return {
        status: response.status,
        headers,
        data: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      };
    } catch {
      // Preserve invalid UTF-8 bytes through the base64 fallback.
    }
  }
  if (normalizedContentType === "application/json" || normalizedContentType.endsWith("+json")) {
    return {
      status: response.status,
      headers,
      data: JSON.parse(new TextDecoder().decode(bytes)),
    };
  }
  if (isTextProxyContentType(normalizedContentType)) {
    return {
      status: response.status,
      headers,
      data: new TextDecoder().decode(bytes),
    };
  }
  return {
    status: response.status,
    headers,
    bodyEncoding: "base64",
    data: Buffer.from(bytes).toString("base64"),
  };
}

export async function readProviderProxyErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  // An unfollowed redirect's body usually echoes its `Location`, which may carry a signed target URL.
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    return fallbackMessage;
  }
  // Error text is diagnostic and must never turn an upstream failure into a 413
  // invalid_input. Share the error cap and the empty-on-failure behavior with
  // readProviderErrorTextBody.
  return (await readProviderErrorTextBody(response, "proxy error response")) || fallbackMessage;
}

function isTextProxyContentType(contentType: string): boolean {
  const normalized = contentType.split(";", 1)[0]!.trim().toLowerCase();
  return (
    normalized.startsWith("text/") ||
    normalized === "application/x-ndjson" ||
    normalized === "application/xml" ||
    normalized === "application/xml-external-parsed-entity" ||
    normalized === "application/xml-dtd" ||
    normalized.endsWith("+xml") ||
    normalized.includes("javascript") ||
    normalized.includes("x-www-form-urlencoded")
  );
}

export function toProviderProxyError(error: unknown, fallbackMessage: string): ProxyExecutionResult {
  const result = toProviderExecutionError(error, fallbackMessage);
  if (result.ok) {
    return {
      ok: false,
      error: {
        code: "provider_error",
        message: fallbackMessage,
      },
    };
  }
  return {
    ok: false,
    error: result.error!,
  };
}

export function defineProviderProxy(input: ProviderProxyDefinition): ProviderProxyExecutor {
  const allowedOrigins = new Set(input.allowedOrigins?.map((value) => new URL(value).origin));
  const authSensitiveHeaders =
    input.auth.type === "credential_headers"
      ? [...new Set(input.auth.headers.map((header) => header.name.toLowerCase()))]
      : input.auth.type === "api_key_header" ||
          input.auth.type === "optional_api_key_header" ||
          input.auth.type === "custom_credential_header"
        ? [input.auth.name]
        : undefined;
  const additionalSensitiveHeaders = [...(authSensitiveHeaders ?? []), ...(input.sensitiveHeaders ?? [])];
  const egressFetch = createProviderFetch({
    allowPrivateNetwork: input.allowPrivateNetwork,
    skipDnsValidation: input.skipDnsValidation,
    additionalSensitiveHeaders: additionalSensitiveHeaders.length > 0 ? additionalSensitiveHeaders : undefined,
  });
  return async (proxyInput: ProxyRequestInput, context: ExecutionContext): Promise<ProxyExecutionResult> => {
    try {
      const baseUrl = await resolveProviderProxyBaseUrl(input.baseUrl, context, input.service);
      const endpointOrigins = [baseUrl, ...(input.allowedOrigins ?? [])];
      const endpoint = normalizeProviderProxyEndpoint(proxyInput.endpoint, endpointOrigins);
      if (input.allowedEndpoint && !input.allowedEndpoint(endpoint)) {
        throw new ProviderRequestError(400, "endpoint is not supported for this provider");
      }

      const url = createProviderProxyUrl(baseUrl, endpoint, proxyInput.query, endpointOrigins);
      const providerOrigin = url.origin;
      const headers = normalizeProviderProxyHeaders(proxyInput.headers);
      headers.set("user-agent", providerUserAgent);
      const authResult = await applyProviderProxyAuth(
        input,
        context,
        url,
        headers,
        proxyInput.method,
        proxyInput.body,
        egressFetch,
      );
      let requestBody = authResult.body;
      await input.customizeRequest?.({
        context,
        service: input.service,
        endpoint,
        method: proxyInput.method,
        url,
        headers,
        body: requestBody,
        setBody(body) {
          requestBody = body;
        },
        credential: authResult.credential,
        fetcher: egressFetch,
      });
      if (url.origin !== providerOrigin && !allowedOrigins.has(url.origin)) {
        throw new ProviderRequestError(400, "endpoint must stay on the provider origin");
      }

      const timeout = createProviderTimeout(context.signal, input.timeoutMs);
      try {
        const init: RequestInit = {
          method: proxyInput.method,
          headers,
          redirect: input.redirect,
          signal: timeout.signal,
        };
        if (requestBody !== undefined) {
          init.body = typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody);
          if (!headers.has("content-type") && typeof requestBody !== "string") {
            headers.set("content-type", "application/json");
          }
        }

        const response = await egressFetch(url, init);
        if (!response.ok) {
          // A provider error parser would surface an unfollowed redirect's body; the shared reader withholds it.
          if (input.readError && (response.status < 300 || response.status >= 400)) {
            throw await input.readError(response);
          }
          throw new ProviderRequestError(
            response.status,
            await readProviderProxyErrorMessage(response, `provider request failed with HTTP ${response.status}`),
          );
        }

        return {
          ok: true,
          response: await readProviderProxyResponse(response, { maxBytes: input.maxResponseBytes }),
        };
      } catch (error) {
        // Only the local budget becomes the shared 504 timeout; a caller abort stays an abort.
        if (error instanceof ProviderRequestError || !timeout.didTimeout()) {
          throw error;
        }
        throw new ProviderRequestError(504, `${input.service} request timed out`);
      } finally {
        timeout.cleanup();
      }
    } catch (error) {
      return toProviderProxyError(error, "provider request failed");
    }
  };
}

/** Match a normalized provider proxy endpoint against one or more path prefixes. */
export function providerProxyEndpointPrefixes(...prefixes: string[]): (endpoint: string) => boolean {
  return (endpoint) =>
    prefixes.some((prefix) => endpoint === prefix || endpoint.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

export function credentialProviderProxyBaseUrl(...fields: string[]): ProviderProxyBaseUrlResolver {
  return async (context: ExecutionContext, service: string): Promise<string> => {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType === "no_auth") {
      throw new ProviderRequestError(401, `Configure ${service} credentials first.`);
    }

    for (const field of fields) {
      const metadataValue = optionalString(credential.metadata[field]);
      if (metadataValue) {
        return metadataValue;
      }
      if ("values" in credential) {
        const value = optionalString(credential.values[field]);
        if (value) {
          return value;
        }
      }
    }

    throw new ProviderRequestError(400, `credential metadata is missing ${fields.join(", ")}`);
  };
}

async function resolveProviderProxyBaseUrl(
  baseUrl: ProviderProxyBaseUrl,
  context: ExecutionContext,
  service: string,
): Promise<string> {
  return typeof baseUrl === "string" ? baseUrl : await baseUrl(context, service);
}

async function applyProviderProxyAuth(
  input: ProviderProxyDefinition,
  context: ExecutionContext,
  url: URL,
  headers: Headers,
  method: string,
  body: unknown,
  egressFetch: typeof fetch,
): Promise<ProviderProxyAuthResult> {
  switch (input.auth.type) {
    case "none":
      return { credential: undefined, body };
    case "bearer": {
      const credential = await requireBearerCredential(context, input.service);
      headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
      return { credential: undefined, body };
    }
    case "oauth_bearer": {
      const credential = await requireOAuthCredential(context, input.service);
      headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
      return { credential, body };
    }
    case "bearer_resolver": {
      const resolved = await input.auth.resolve({
        context,
        service: input.service,
        fetcher: egressFetch,
        signal: context.signal,
      });
      headers.set("authorization", `${resolved.tokenType ?? "Bearer"} ${resolved.accessToken}`);
      return { credential: undefined, body };
    }
    case "oauth_query": {
      const credential = await requireOAuthCredential(context, input.service);
      url.searchParams.set(input.auth.name, credential.accessToken);
      return { credential, body };
    }
    case "api_key_header": {
      const credential = await requireApiKeyCredential(context, input.service);
      headers.set(input.auth.name, credential.apiKey);
      return { credential, body };
    }
    case "api_key_query": {
      const credential = await requireApiKeyCredential(context, input.service);
      url.searchParams.set(input.auth.name, credential.apiKey);
      return { credential, body };
    }
    case "optional_api_key_header": {
      const credential = await optionalProviderProxyApiKeyCredential(context, input.service);
      if (credential) {
        headers.set(input.auth.name, `${input.auth.prefix ?? ""}${credential.apiKey}`);
      } else {
        headers.delete(input.auth.name);
      }
      return { credential, body };
    }
    case "optional_api_key_query": {
      const credential = await optionalProviderProxyApiKeyCredential(context, input.service);
      if (credential) {
        url.searchParams.set(input.auth.name, credential.apiKey);
      } else {
        url.searchParams.delete(input.auth.name);
      }
      return { credential, body };
    }
    case "api_key_json_body": {
      const credential = await requireApiKeyCredential(context, input.service);
      return { credential, body: injectProviderProxyJsonBodyField(body, input.auth.name, credential.apiKey) };
    }
    case "api_key_query_or_json_body": {
      const credential = await requireApiKeyCredential(context, input.service);
      if (providerProxyBodyMethods(input.auth.bodyMethods).has(method.toUpperCase())) {
        url.searchParams.delete(input.auth.name);
        return { credential, body: injectProviderProxyJsonBodyField(body, input.auth.name, credential.apiKey) };
      }
      url.searchParams.set(input.auth.name, credential.apiKey);
      return { credential, body };
    }
    case "api_key_query_or_form_body": {
      const credential = await requireApiKeyCredential(context, input.service);
      if (providerProxyBodyMethods(input.auth.bodyMethods).has(method.toUpperCase())) {
        url.searchParams.delete(input.auth.name);
        headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
        return { credential, body: injectProviderProxyFormBodyField(body, input.auth.name, credential.apiKey) };
      }
      url.searchParams.set(input.auth.name, credential.apiKey);
      return { credential, body };
    }
    case "api_key_basic": {
      const credential = await requireApiKeyCredential(context, input.service);
      headers.set("authorization", basicAuthorizationHeader(`${credential.apiKey}${input.auth.suffix ?? ""}`));
      return { credential, body };
    }
    case "api_key_authorization": {
      const credential = await requireApiKeyCredential(context, input.service);
      headers.set("authorization", `${input.auth.prefix}${credential.apiKey}${input.auth.suffix ?? ""}`);
      return { credential, body };
    }
    case "custom_credential_header": {
      const credential = await requireCustomCredential(context, input.service);
      const value = credential.values[input.auth.field];
      if (!value) {
        throw new ProviderRequestError(
          401,
          `Configure ${input.service} custom credential field ${input.auth.field} first.`,
        );
      }
      headers.set(input.auth.name, `${input.auth.prefix ?? ""}${value}`);
      return { credential, body };
    }
    case "credential_headers": {
      const credential = await context.getCredential(input.service);
      if (!credential || credential.authType === "no_auth") {
        throw new ProviderRequestError(401, `Configure ${input.service} credentials first.`);
      }
      for (const header of input.auth.headers) {
        const value = readProviderProxyCredentialHeaderValue(credential, header.source, input.service);
        if (!value) {
          if (header.optional) {
            headers.delete(header.name);
            continue;
          }
          throw new ProviderRequestError(
            401,
            `Configure ${input.service} credential field ${providerProxyCredentialHeaderSourceName(header.source)} first.`,
          );
        }
        headers.set(header.name, `${header.prefix ?? ""}${value}${header.suffix ?? ""}`);
      }
      return { credential, body };
    }
  }
}

interface ProviderProxyAuthResult {
  credential: ResolvedCredential | undefined;
  body: unknown;
}

async function optionalProviderProxyApiKeyCredential(
  context: ExecutionContext,
  service: string,
): Promise<Extract<ResolvedCredential, { authType: "api_key" }> | undefined> {
  const credential = await context.getCredential(service);
  if (!credential || credential.authType === "no_auth") return undefined;
  if (credential.authType === "api_key") return credential;
  throw new ProviderRequestError(401, `Connect ${service} without authentication or configure an API key.`);
}

function providerProxyBodyMethods(methods: readonly string[] | undefined): Set<string> {
  return new Set((methods ?? ["POST", "PUT", "PATCH"]).map((method) => method.toUpperCase()));
}

function injectProviderProxyJsonBodyField(body: unknown, name: string, value: string): Record<string, unknown> {
  if (body == null) return { [name]: value };
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new ProviderRequestError(400, `${name} proxy auth requires a JSON object body`);
  }
  return { ...body, [name]: value };
}

function injectProviderProxyFormBodyField(body: unknown, name: string, value: string): string {
  const form = new URLSearchParams();
  if (typeof body === "string") {
    for (const [field, fieldValue] of new URLSearchParams(body)) form.set(field, fieldValue);
  } else if (body != null && typeof body === "object" && !Array.isArray(body)) {
    for (const [field, fieldValue] of Object.entries(body)) {
      if (fieldValue != null) form.set(field, String(fieldValue));
    }
  } else if (body != null) {
    throw new ProviderRequestError(400, `${name} proxy auth requires a form-compatible body`);
  }
  form.set(name, value);
  return form.toString();
}

function readProviderProxyCredentialHeaderValue(
  credential: Exclude<ResolvedCredential, { authType: "no_auth" }>,
  source: ProviderProxyCredentialHeaderSource,
  service: string,
): string | undefined {
  switch (source.type) {
    case "api_key":
      if (credential.authType !== "api_key") {
        throw new ProviderRequestError(401, `${service} proxy requires an API key credential.`);
      }
      return credential.apiKey;
    case "credential_value":
      if (credential.authType !== "api_key" && credential.authType !== "custom_credential") {
        throw new ProviderRequestError(401, `${service} proxy requires an API key or custom credential.`);
      }
      return credential.values[source.name];
    case "credential_metadata":
      return optionalString(credential.metadata[source.name])?.trim();
  }
}

function providerProxyCredentialHeaderSourceName(source: ProviderProxyCredentialHeaderSource): string {
  return source.type === "api_key" ? "apiKey" : source.name;
}
