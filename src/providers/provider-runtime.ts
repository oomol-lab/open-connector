import type {
  ActionExecutor,
  ExecutionContext,
  ExecutionResult,
  ProviderExecutors,
  ResolvedCredential,
  TransitFileWriter,
} from "../core/types.ts";

import { CastError } from "../core/cast.ts";

/**
 * Fetch-compatible function accepted by provider runtime helpers and tests.
 */
export type ProviderFetch = typeof fetch;

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
  const upload = await context.transitFiles.create(
    new File([await response.arrayBuffer()], input.name, { type: mimeType }),
  );
  return {
    fileId: upload.fileId,
    downloadUrl: upload.downloadUrl,
    sizeBytes: upload.sizeBytes,
    name: input.name,
    mimeType,
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
            await input.createContext(executionContext, fetch),
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
