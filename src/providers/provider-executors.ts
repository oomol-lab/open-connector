import type {
  ActionExecutor,
  ExecutionContext,
  ExecutionResult,
  ProviderExecutors,
  ResolvedCredential,
  TransitFileWriter,
} from "../core/types.ts";
import type { ProviderActionNames } from "./action-contracts.generated.ts";
import type { ProviderFetch } from "./provider-runtime.ts";

import {
  createProviderFetch,
  providerFetch,
  ProviderRequestError,
  toProviderExecutionError,
} from "./provider-runtime.ts";

/**
 * Provider-native handler shape. The provider owns `TContext`; the shared
 * runtime only adapts it to the action executor contract.
 */
export type ProviderRuntimeHandler<TContext> = (input: Record<string, unknown>, context: TContext) => Promise<unknown>;

export type ProviderActionName<TService extends keyof ProviderActionNames> = ProviderActionNames[TService];

export type ProviderActionHandlers<TService extends keyof ProviderActionNames, THandler> = Record<
  ProviderActionName<TService>,
  THandler
>;

export type ProviderActionHandlerSubset<TService extends keyof ProviderActionNames, THandler> = Partial<
  ProviderActionHandlers<TService, THandler>
>;

export type ProviderActionSources<TService extends keyof ProviderActionNames, TSource> = Record<
  ProviderActionName<TService>,
  TSource
>;

interface NamedActionSource {
  name: string;
}

/**
 * Build handlers from the same complete source list used to define a provider's actions.
 */
export function mapProviderActionHandlers<
  const TService extends keyof ProviderActionNames,
  TSource extends NamedActionSource,
  THandler,
>(
  _service: TService,
  sources: readonly TSource[],
  createHandler: (source: TSource, name: ProviderActionName<TService>) => THandler,
): ProviderActionHandlers<TService, THandler> {
  return Object.fromEntries(
    sources.map((source) => [source.name, createHandler(source, source.name as ProviderActionName<TService>)]),
  ) as ProviderActionHandlers<TService, THandler>;
}

/**
 * Build handlers from the complete action-name list used by a provider definition.
 */
export function mapProviderActionNames<const TService extends keyof ProviderActionNames, THandler>(
  _service: TService,
  names: readonly string[],
  createHandler: (name: ProviderActionName<TService>) => THandler,
): ProviderActionHandlers<TService, THandler> {
  return Object.fromEntries(
    names.map((name) => [name, createHandler(name as ProviderActionName<TService>)]),
  ) as ProviderActionHandlers<TService, THandler>;
}

/**
 * Build handlers from an action-keyed source record checked against the generated contract.
 */
export function mapProviderActionSources<
  const TService extends keyof ProviderActionNames,
  TSources extends ProviderActionSources<TService, unknown>,
  THandler,
>(
  _service: TService,
  sources: TSources,
  createHandler: (name: ProviderActionName<TService>, source: TSources[ProviderActionName<TService>]) => THandler,
): ProviderActionHandlers<TService, THandler> {
  return Object.fromEntries(
    Object.entries(sources).map(([name, source]) => [
      name,
      createHandler(name as ProviderActionName<TService>, source as TSources[ProviderActionName<TService>]),
    ]),
  ) as ProviderActionHandlers<TService, THandler>;
}

/** Combine handler fragments whose completeness is checked by the final generated contract. */
export function combineProviderActionHandlers<const TService extends keyof ProviderActionNames, THandler>(
  _service: TService,
  ...parts: readonly ProviderActionHandlerSubset<TService, THandler>[]
): ProviderActionHandlers<TService, THandler> {
  return Object.assign({}, ...parts) as ProviderActionHandlers<TService, THandler>;
}

/** Look up a generated-contract handler at a runtime string boundary. */
export function getProviderActionHandler<THandlers extends object>(
  handlers: THandlers,
  name: string,
): THandlers[keyof THandlers] | undefined {
  return handlers[name as keyof THandlers];
}

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
  /** Override the standard execution-error mapping when the provider exposes stable native error codes. */
  mapError?: (error: unknown) => ExecutionResult;
  /** Deployment-gated private-network opt-in applied to this provider's egress fetch (currently Dokploy). */
  allowPrivateNetwork?: () => boolean;
  /** Skip the redundant DNS resolved-address check; only for hardcoded-host providers. */
  skipDnsValidation?: boolean;
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

/**
 * Request an API-key provider action handler receives: the resolved key, the
 * provider-local action name, the schema-validated action input, the full
 * credential field map (`values` also carries `apiKey`) and the runtime
 * metadata the credential validator stored on the connection. Executors pass
 * every field; the optional markers only let provider-local helpers accept a
 * narrower request.
 */
export interface ApiKeyActionRequest {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

export interface OAuthProviderContext {
  accessToken: string;
  tokenType?: string;
  accountId?: string;
  providerSecret?: Record<string, unknown>;
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
  const egressFetch =
    input.allowPrivateNetwork || input.skipDnsValidation
      ? createProviderFetch({
          allowPrivateNetwork: input.allowPrivateNetwork,
          skipDnsValidation: input.skipDnsValidation,
        })
      : providerFetch;
  for (const [name, handler] of Object.entries(input.handlers)) {
    executors[`${input.service}.${name}`] = async (actionInput, executionContext): Promise<ExecutionResult> => {
      try {
        return {
          ok: true,
          output: await handler(
            actionInput as Record<string, unknown>,
            await input.createContext(executionContext, egressFetch),
          ),
        };
      } catch (error) {
        return input.mapError?.(error) ?? toProviderExecutionError(error, fallbackMessage);
      }
    };
  }

  return executors;
}

/** Egress-guard options shared by the credential-typed executor helpers. */
export interface ProviderExecutorEgressOptions {
  /** Deployment-gated private-network opt-in (see {@link ProviderExecutorDefinition.allowPrivateNetwork}). */
  allowPrivateNetwork?: () => boolean;
  /** Skip the redundant DNS resolved-address check; only for hardcoded-host providers. */
  skipDnsValidation?: boolean;
}

/**
 * Define executors for providers that use the built-in API key credential.
 */
export function defineApiKeyProviderExecutors(
  service: string,
  handlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>>,
  options: ProviderExecutorEgressOptions = {},
): ProviderExecutors {
  return defineProviderExecutors<ApiKeyProviderContext>({
    service,
    handlers,
    allowPrivateNetwork: options.allowPrivateNetwork,
    skipDnsValidation: options.skipDnsValidation,
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
  options: ProviderExecutorEgressOptions = {},
): ProviderExecutors {
  return defineProviderExecutors<OAuthProviderContext>({
    service,
    handlers,
    allowPrivateNetwork: options.allowPrivateNetwork,
    skipDnsValidation: options.skipDnsValidation,
    async createContext(context, fetcher): Promise<OAuthProviderContext> {
      const credential = await requireOAuthCredential(context, service);
      const providerContext: OAuthProviderContext = {
        accessToken: credential.accessToken,
        tokenType: credential.tokenType,
        accountId: credential.profile.accountId,
        providerSecret: credential.providerSecret,
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
  options: ProviderExecutorEgressOptions = {},
): ProviderExecutors {
  return defineProviderExecutors<BearerProviderContext>({
    service,
    handlers,
    allowPrivateNetwork: options.allowPrivateNetwork,
    skipDnsValidation: options.skipDnsValidation,
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
