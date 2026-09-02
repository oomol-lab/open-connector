import type { ActionExecutor, CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../core/types.ts";
import type { ProviderOAuthRuntime } from "../oauth/oauth-token.ts";

import { withProviderFallbackMessage } from "./provider-runtime.ts";

export interface ExecutorModule {
  credentialValidators?: CredentialValidators;
  executors: ProviderExecutors;
  oauth?: ProviderOAuthRuntime;
  proxy?: ProviderProxyExecutor;
}

export interface ExecutorModules {
  [service: string]: () => Promise<ExecutorModule>;
}

/**
 * Loads provider runtime modules only when an action, proxy, credential validator,
 * or provider-specific OAuth token operation runs.
 *
 * Provider definitions are intentionally not exposed here. Runtime catalog
 * reads should use generated `catalog/apps/*.json` instead of importing
 * hundreds of provider definition modules at startup.
 */
export interface IProviderLoader {
  /**
   * Load one executor only when an action is being executed.
   */
  loadActionExecutor(
    service: string,
    actionId: string,
    providerDisplayName?: string,
  ): Promise<ActionExecutor | undefined>;

  /**
   * Load a provider proxy executor only when a proxy request is executed.
   */
  loadProxyExecutor(service: string, providerDisplayName?: string): Promise<ProviderProxyExecutor | undefined>;

  /**
   * Load a provider credential validator only when a connection is created.
   */
  loadCredentialValidators(service: string): Promise<CredentialValidators | undefined>;

  /** Load provider-specific OAuth operations when the provider defines them. */
  loadProviderOAuthRuntime?(service: string): Promise<ProviderOAuthRuntime | undefined>;
}

/**
 * Provider loader backed by the executor registry selected by the runtime entry point.
 */
export class ProviderLoader implements IProviderLoader {
  private readonly executorModules: ExecutorModules;

  constructor(executorModules: ExecutorModules) {
    this.executorModules = executorModules;
  }

  async loadActionExecutor(
    service: string,
    actionId: string,
    providerDisplayName?: string,
  ): Promise<ActionExecutor | undefined> {
    const loadExecutors = this.executorModules[service];
    if (!loadExecutors) {
      return undefined;
    }

    const module = await loadExecutors();
    const executor = this._findActionExecutor(service, actionId, module.executors);
    return executor && providerDisplayName ? withProviderFallbackMessage(executor, providerDisplayName) : executor;
  }

  async loadProxyExecutor(service: string, _providerDisplayName?: string): Promise<ProviderProxyExecutor | undefined> {
    const loadExecutors = this.executorModules[service];
    if (!loadExecutors) {
      return undefined;
    }

    const module = await loadExecutors();
    return module.proxy;
  }

  async loadCredentialValidators(service: string): Promise<CredentialValidators | undefined> {
    const loadExecutors = this.executorModules[service];
    if (!loadExecutors) {
      return undefined;
    }

    const module = await loadExecutors();
    return module.credentialValidators;
  }

  async loadProviderOAuthRuntime(service: string): Promise<ProviderOAuthRuntime | undefined> {
    const loadRuntime = this.executorModules[service];
    if (!loadRuntime) {
      return undefined;
    }

    return (await loadRuntime()).oauth;
  }

  private _findActionExecutor(
    service: string,
    actionId: string,
    executors: ProviderExecutors,
  ): ActionExecutor | undefined {
    if (!actionId.startsWith(`${service}.`)) {
      return undefined;
    }

    return executors[actionId as `${string}.${string}`];
  }
}
