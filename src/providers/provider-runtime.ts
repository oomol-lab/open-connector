import type {
  ActionExecutor,
  ExecutionContext,
  ExecutionResult,
  ProviderExecutors,
  ResolvedCredential,
} from "../core/types.ts";

import { CastError } from "../core/cast.ts";

/**
 * Fetch-compatible function accepted by provider runtime helpers and tests.
 */
export type ProviderFetch = typeof fetch;

/**
 * Provider-native handler shape. The provider owns `TContext`; the shared
 * runtime only adapts it to the action executor contract.
 */
export type ProviderRuntimeHandler<TContext> = (
  input: Record<string, unknown>,
  context: TContext,
) => Promise<unknown>;

/**
 * Runtime context factory used before invoking one provider-native handler.
 */
export type ProviderRuntimeContextFactory<TContext> = (
  context: ExecutionContext,
  fetcher: ProviderFetch,
) => Promise<TContext> | TContext;

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
    if (value) {
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
export function defineProviderExecutors<TContext>(input: {
  service: string;
  handlers: Record<string, ProviderRuntimeHandler<TContext>>;
  createContext: ProviderRuntimeContextFactory<TContext>;
  fallbackMessage?: string;
}): ProviderExecutors {
  const executors: ProviderExecutors = {};
  const fallbackMessage = input.fallbackMessage ?? "provider request failed";
  for (const [name, handler] of Object.entries(input.handlers)) {
    executors[`${input.service}.${name}`] = async (
      actionInput,
      executionContext,
    ): Promise<ExecutionResult> => {
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
 * Attach the provider display name to a loaded executor so generic provider
 * errors can use catalog metadata without duplicating it in executor modules.
 */
export function withProviderFallbackMessage(
  executor: ActionExecutor,
  displayName: string,
): ActionExecutor {
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
 * Return a bearer token from either OAuth or API key credentials.
 */
export async function requireBearerCredential(
  context: ExecutionContext,
  service: string,
): Promise<{ tokenType: string; accessToken: string }> {
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
