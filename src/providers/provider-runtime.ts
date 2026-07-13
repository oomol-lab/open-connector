import type {
  ActionExecutor,
  ExecutionContext,
  ExecutionResult,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
  ProxyRequestInput,
  ProxyResponse,
  ResolvedCredential,
  TransitFileWriter,
} from "../core/types.ts";

import { Buffer } from "node:buffer";
import { CastError, optionalRecord, optionalScalarString, optionalString, requiredString } from "../core/cast.ts";
import { readBoundedResponseBytes } from "../core/request.ts";

/**
 * Fetch-compatible function accepted by provider runtime helpers and tests.
 */
export type ProviderFetch = typeof fetch;

/**
 * Receiver-safe wrapper for the platform fetch implementation.
 *
 * Provider runtimes commonly store this function on a context object before
 * invoking it. Calling the Workers-native fetch function that way forwards the
 * context object as `this` and causes an Illegal invocation error. This wrapper
 * keeps the native call lexical while remaining easy to replace in tests.
 */
export const providerFetch: ProviderFetch = (input, init) => fetch(input, init);

/**
 * Default User-Agent sent by local provider executors.
 */
export const providerUserAgent = "oomol-connect/0.1";

/**
 * Provider-native handler shape. The provider owns `TContext`; the shared
 * runtime only adapts it to the action executor contract.
 */
export type ProviderRuntimeHandler<TContext> = (input: Record<string, unknown>, context: TContext) => Promise<unknown>;

/**
 * Runtime context factory used before invoking one provider-native handler.
 */
export type ProviderRuntimeContextFactory<TContext> = (
  context: ExecutionContext,
  fetcher: ProviderFetch,
) => Promise<TContext> | TContext;

export interface ProviderExecutorDefinition<TContext> {
  service: string;
  handlers: Record<string, ProviderRuntimeHandler<TContext>>;
  createContext: ProviderRuntimeContextFactory<TContext>;
  fallbackMessage?: string;
}

export interface BearerCredential {
  tokenType: string;
  accessToken: string;
}

export interface ApiKeyProviderContext {
  apiKey: string;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

export interface OAuthProviderContext {
  accessToken: string;
  tokenType?: string;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

export interface BearerProviderContext {
  accessToken: string;
  tokenType?: string;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

export interface ProviderTransitFile {
  fileId: string;
  downloadUrl: string;
  sizeBytes: number;
  name: string;
  mimeType: string;
}

export interface ProviderInputFile {
  fileId: string;
  file: File;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Error raised for provider API responses and mapped to stable execution errors.
 */
export class ProviderRequestError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export interface ProviderTimeout {
  signal: AbortSignal;
  didTimeout(): boolean;
  cleanup(): void;
}

export interface BearerProviderProxyDefinition {
  service: string;
  baseUrl: string;
  allowedEndpoint?: (endpoint: string) => boolean;
}

export type ProviderProxyAuth =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "oauth_bearer" }
  | { type: "api_key_header"; name: string }
  | { type: "api_key_query"; name: string }
  | { type: "api_key_basic"; suffix?: string }
  | { type: "api_key_authorization"; prefix: string; suffix?: string };

export type ProviderProxyBaseUrlResolver = (context: ExecutionContext, service: string) => Promise<string> | string;
export type ProviderProxyBaseUrl = string | ProviderProxyBaseUrlResolver;

export interface ProviderProxyRequestCustomizationInput {
  context: ExecutionContext;
  service: string;
  endpoint: string;
  url: URL;
  headers: Headers;
  credential?: ResolvedCredential;
}

export interface ProviderProxyDefinition {
  service: string;
  baseUrl: ProviderProxyBaseUrl;
  auth: ProviderProxyAuth;
  allowedEndpoint?: (endpoint: string) => boolean;
  customizeRequest?: (input: ProviderProxyRequestCustomizationInput) => Promise<void> | void;
}

const blockedProxyRequestHeaders = new Set([
  "authorization",
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
]);
const defaultProviderProxyMaxResponseBytes = 20 * 1024 * 1024;
const defaultProviderJsonMaxResponseBytes = 20 * 1024 * 1024;

export function createProviderProxyUrl(baseUrl: string, endpointInput: unknown, queryInput?: unknown): URL {
  const endpoint = normalizeProviderProxyEndpoint(endpointInput);
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const url = new URL(endpoint.slice(1), base);
  for (const [key, value] of Object.entries(normalizeProviderProxyQuery(queryInput))) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function normalizeProviderProxyEndpoint(endpointInput: unknown): string {
  const endpoint = requiredString(endpointInput, "endpoint", (message) => new ProviderRequestError(400, message));
  if (!endpoint.startsWith("/") || endpoint.startsWith("//")) {
    throw new ProviderRequestError(400, "endpoint must be a relative path starting with /");
  }
  try {
    new URL(endpoint);
    throw new ProviderRequestError(400, "endpoint must be a relative path");
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
  const normalizedContentType = contentType.toLowerCase();
  if (bytes.byteLength === 0) {
    return {
      status: response.status,
      headers,
      data: null,
    };
  }
  if (normalizedContentType.includes("json")) {
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
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: defaultProviderProxyMaxResponseBytes,
    fieldName: "proxy error response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  return bytes.byteLength === 0 ? fallbackMessage : new TextDecoder().decode(bytes) || fallbackMessage;
}

function isTextProxyContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("text/") ||
    normalized.includes("xml") ||
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
  return async (proxyInput: ProxyRequestInput, context: ExecutionContext): Promise<ProxyExecutionResult> => {
    try {
      const endpoint = normalizeProviderProxyEndpoint(proxyInput.endpoint);
      if (input.allowedEndpoint && !input.allowedEndpoint(endpoint)) {
        throw new ProviderRequestError(400, "endpoint is not supported for this provider");
      }

      const url = createProviderProxyUrl(
        await resolveProviderProxyBaseUrl(input.baseUrl, context, input.service),
        endpoint,
        proxyInput.query,
      );
      const headers = normalizeProviderProxyHeaders(proxyInput.headers);
      headers.set("user-agent", providerUserAgent);
      const credential = await applyProviderProxyAuth(input, context, url, headers);
      await input.customizeRequest?.({
        context,
        service: input.service,
        endpoint,
        url,
        headers,
        credential,
      });

      const init: RequestInit = {
        method: proxyInput.method,
        headers,
        signal: context.signal,
      };
      if (proxyInput.body !== undefined) {
        init.body = typeof proxyInput.body === "string" ? proxyInput.body : JSON.stringify(proxyInput.body);
        if (!headers.has("content-type") && typeof proxyInput.body !== "string") {
          headers.set("content-type", "application/json");
        }
      }

      const response = await fetch(url, init);
      if (!response.ok) {
        throw new ProviderRequestError(
          response.status,
          await readProviderProxyErrorMessage(response, `provider request failed with HTTP ${response.status}`),
        );
      }

      return {
        ok: true,
        response: await readProviderProxyResponse(response),
      };
    } catch (error) {
      return toProviderProxyError(error, "provider request failed");
    }
  };
}

export function defineBearerProviderProxy(input: BearerProviderProxyDefinition): ProviderProxyExecutor {
  return defineProviderProxy({
    ...input,
    auth: { type: "bearer" },
  });
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
): Promise<ResolvedCredential | undefined> {
  switch (input.auth.type) {
    case "none":
      return undefined;
    case "bearer": {
      const credential = await requireBearerCredential(context, input.service);
      headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
      return undefined;
    }
    case "oauth_bearer": {
      const credential = await requireOAuthCredential(context, input.service);
      headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
      return credential;
    }
    case "api_key_header": {
      const credential = await requireApiKeyCredential(context, input.service);
      headers.set(input.auth.name, credential.apiKey);
      return credential;
    }
    case "api_key_query": {
      const credential = await requireApiKeyCredential(context, input.service);
      url.searchParams.set(input.auth.name, credential.apiKey);
      return credential;
    }
    case "api_key_basic": {
      const credential = await requireApiKeyCredential(context, input.service);
      headers.set("authorization", `Basic ${btoa(`${credential.apiKey}${input.auth.suffix ?? ""}`)}`);
      return credential;
    }
    case "api_key_authorization": {
      const credential = await requireApiKeyCredential(context, input.service);
      headers.set("authorization", `${input.auth.prefix}${credential.apiKey}${input.auth.suffix ?? ""}`);
      return credential;
    }
  }
}

/**
 * Return an abort signal that fires when either the parent signal aborts or the
 * provider-local timeout expires.
 */
export function createProviderTimeout(parentSignal: AbortSignal | undefined, timeoutMs: number): ProviderTimeout {
  const controller = new AbortController();
  let timeoutReached = false;
  const timeoutId = setTimeout(() => {
    timeoutReached = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = (): void => controller.abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  return {
    signal: controller.signal,
    didTimeout: () => timeoutReached,
    cleanup() {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

/**
 * Return whether a caught error represents a fetch abort.
 */
export function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Return whether an error came from a specific aborted signal.
 */
export function isAbortSignalError(signal: AbortSignal | undefined, error: unknown): boolean {
  return signal?.aborted === true && isAbortLikeError(error);
}

/**
 * Set defined query parameters on a URL.
 */
export function setSearchParams(url: URL, query: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
}

/**
 * Read a JSON provider response or raise a structured provider request error.
 */
export async function readProviderJson<T>(response: Response, source: string): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  const text = await response.text().catch(() => "");
  throw new ProviderRequestError(response.status, text || `${source} request failed`);
}

export interface ReadProviderJsonBodyOptions {
  emptyBody: unknown;
  invalidJsonMessage: string;
  invalidJsonStatus?: number;
  invalidJsonFallback?: (text: string, error: unknown) => unknown;
  maxBytes?: number;
  trimEmptyBody?: boolean;
}

/**
 * Read a bounded provider response body as text.
 */
export async function readProviderTextBody(
  response: Response,
  fieldName: string,
  maxBytes: number = defaultProviderJsonMaxResponseBytes,
): Promise<string> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes,
    fieldName,
    createError: (message) => new ProviderRequestError(413, message),
  });
  return new TextDecoder().decode(bytes);
}

/**
 * Read a bounded provider response body as JSON.
 */
export async function readProviderJsonBody(response: Response, options: ReadProviderJsonBodyOptions): Promise<unknown> {
  const text = await readProviderTextBody(response, "provider JSON response", options.maxBytes);
  return parseProviderJsonBodyText(text, options);
}

/**
 * Parse an already-read provider response body as JSON.
 */
export function parseProviderJsonBodyText(text: string, options: ReadProviderJsonBodyOptions): unknown {
  const isEmpty = options.trimEmptyBody === false ? text === "" : text.trim() === "";
  if (isEmpty) {
    return options.emptyBody;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const fallback = options.invalidJsonFallback?.(text, error);
    if (fallback !== undefined) {
      return fallback;
    }
    throw new ProviderRequestError(options.invalidJsonStatus ?? 502, options.invalidJsonMessage, error);
  }
}

/**
 * Store a provider-hosted file in the local transit file service when enabled.
 */
export async function uploadProviderUrlToTransitFile(
  input: {
    url: string;
    name: string;
    source: string;
  },
  context: Pick<ApiKeyProviderContext, "fetcher" | "transitFiles" | "signal">,
): Promise<ProviderTransitFile | null> {
  if (!context.transitFiles) {
    return null;
  }

  let response: Response;
  try {
    response = await context.fetcher(input.url, {
      headers: {
        accept: "*/*",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `${input.source} transit download failed: ${error.message}`
        : `${input.source} transit download failed`,
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      text || `${input.source} transit download failed with HTTP ${response.status}`,
    );
  }

  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: input.name,
    createError: (message) => new ProviderRequestError(413, message),
  });
  const upload = await context.transitFiles.create(new File([Uint8Array.from(bytes)], input.name, { type: mimeType }));
  return {
    fileId: upload.fileId,
    downloadUrl: upload.downloadUrl,
    sizeBytes: upload.sizeBytes,
    name: input.name,
    mimeType,
  };
}

/**
 * Read a user-uploaded transit file reference from action input.
 */
export async function readTransitFileInput(
  input: unknown,
  context: Pick<ApiKeyProviderContext, "transitFiles">,
): Promise<ProviderInputFile> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  const reference = optionalRecord(input);
  if (!reference) {
    throw new ProviderRequestError(400, "file must be a transit file reference.");
  }

  const fileId = requiredString(reference.fileId, "file.fileId", (message) => new ProviderRequestError(400, message));
  const stored = await context.transitFiles.read(fileId);
  const name = optionalString(reference.name) ?? stored.name;
  const mimeType = optionalString(reference.mimeType) ?? stored.mimeType;
  const file =
    name === stored.file.name && mimeType === stored.file.type
      ? stored.file
      : new File([await stored.file.arrayBuffer()], name, { type: mimeType });

  return {
    fileId,
    file,
    name,
    mimeType,
    sizeBytes: stored.sizeBytes,
  };
}

/**
 * Map provider runtime failures to the standard action execution result.
 */
export function toProviderExecutionError(error: unknown, fallbackMessage: string): ExecutionResult {
  if (error instanceof ProviderRequestError) {
    return {
      ok: false,
      error: {
        code:
          error.status === 401 || error.status === 403
            ? "authorization_failed"
            : error.status === 429
              ? "rate_limited"
              : error.status < 500
                ? "invalid_input"
                : "provider_error",
        message: error.message,
        details: {
          status: error.status,
          details: error.details,
        },
      },
    };
  }
  if (error instanceof CastError) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: error.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "provider_error",
      message: error instanceof Error ? error.message : fallbackMessage,
    },
  };
}

/**
 * Adapt a provider-native handler map to full action-id executors.
 *
 * Provider modules should keep action handlers keyed by provider-local action
 * names. The runtime adds the service prefix and returns `undefined` through
 * `ProviderLoader` when a catalog action has no local executor.
 */
export function defineProviderExecutors<TContext>(input: ProviderExecutorDefinition<TContext>): ProviderExecutors {
  const executors: ProviderExecutors = {};
  const fallbackMessage = input.fallbackMessage ?? "provider request failed";
  for (const [name, handler] of Object.entries(input.handlers)) {
    executors[`${input.service}.${name}`] = async (actionInput, executionContext): Promise<ExecutionResult> => {
      try {
        return {
          ok: true,
          output: await handler(
            actionInput as Record<string, unknown>,
            await input.createContext(executionContext, providerFetch),
          ),
        };
      } catch (error) {
        return toProviderExecutionError(error, fallbackMessage);
      }
    };
  }

  return executors;
}

/**
 * Define executors for providers that use the built-in API key credential.
 */
export function defineApiKeyProviderExecutors(
  service: string,
  handlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>>,
): ProviderExecutors {
  return defineProviderExecutors<ApiKeyProviderContext>({
    service,
    handlers,
    async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
      const credential = await requireApiKeyCredential(context, service);
      const providerContext: ApiKeyProviderContext = {
        apiKey: credential.apiKey,
        fetcher,
        signal: context.signal,
      };
      if (context.transitFiles) {
        providerContext.transitFiles = context.transitFiles;
      }
      return providerContext;
    },
  });
}

/**
 * Define executors for providers that require OAuth access tokens.
 */
export function defineOAuthProviderExecutors(
  service: string,
  handlers: Record<string, ProviderRuntimeHandler<OAuthProviderContext>>,
): ProviderExecutors {
  return defineProviderExecutors<OAuthProviderContext>({
    service,
    handlers,
    async createContext(context, fetcher): Promise<OAuthProviderContext> {
      const credential = await requireOAuthCredential(context, service);
      const providerContext: OAuthProviderContext = {
        accessToken: credential.accessToken,
        tokenType: credential.tokenType,
        fetcher,
        signal: context.signal,
      };
      if (context.transitFiles) {
        providerContext.transitFiles = context.transitFiles;
      }
      return providerContext;
    },
  });
}

/**
 * Define executors for providers that can use either OAuth or API key bearer credentials.
 */
export function defineBearerProviderExecutors(
  service: string,
  handlers: Record<string, ProviderRuntimeHandler<BearerProviderContext>>,
): ProviderExecutors {
  return defineProviderExecutors<BearerProviderContext>({
    service,
    handlers,
    async createContext(context, fetcher): Promise<BearerProviderContext> {
      const credential = await requireBearerCredential(context, service);
      const providerContext: BearerProviderContext = {
        accessToken: credential.accessToken,
        tokenType: credential.tokenType,
        fetcher,
        signal: context.signal,
      };
      if (context.transitFiles) {
        providerContext.transitFiles = context.transitFiles;
      }
      return providerContext;
    },
  });
}

/**
 * Attach the provider display name to a loaded executor so generic provider
 * errors can use catalog metadata without duplicating it in executor modules.
 */
export function withProviderFallbackMessage(executor: ActionExecutor, displayName: string): ActionExecutor {
  return async (input, context): Promise<ExecutionResult> => {
    const result = await executor(input, context);
    if (result.ok || !result.error || result.error.message !== "provider request failed") {
      return result;
    }

    return {
      ...result,
      error: {
        ...result.error,
        message: `${displayName} request failed.`,
      },
    };
  };
}

/**
 * Return a configured API key credential for a provider or throw an execution
 * error before making provider API calls.
 */
export async function requireApiKeyCredential(
  context: ExecutionContext,
  service: string,
): Promise<Extract<ResolvedCredential, { authType: "api_key" }>> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "api_key") {
    return credential;
  }

  throw new ProviderRequestError(401, `Configure ${service} API key credentials first.`);
}

/**
 * Return a configured OAuth credential for a provider or throw an execution
 * error before making provider API calls.
 */
export async function requireOAuthCredential(
  context: ExecutionContext,
  service: string,
): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2") {
    return credential;
  }

  throw new ProviderRequestError(401, `Connect ${service} with OAuth first.`);
}

/**
 * Return configured custom credential values for a provider.
 */
export async function requireCustomCredential(
  context: ExecutionContext,
  service: string,
): Promise<Extract<ResolvedCredential, { authType: "custom_credential" }>> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "custom_credential") {
    return credential;
  }

  throw new ProviderRequestError(401, `Configure ${service} custom credentials first.`);
}

/**
 * Return a bearer token from either OAuth or API key credentials.
 */
export async function requireBearerCredential(context: ExecutionContext, service: string): Promise<BearerCredential> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2") {
    return {
      tokenType: credential.tokenType,
      accessToken: credential.accessToken,
    };
  }
  if (credential?.authType === "api_key") {
    return {
      tokenType: "Bearer",
      accessToken: credential.apiKey,
    };
  }

  throw new ProviderRequestError(401, `Configure ${service} credentials first.`);
}
