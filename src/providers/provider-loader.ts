import type { ActionExecutor, CredentialValidators, ProviderExecutors } from "../core/types.ts";

import { withProviderFallbackMessage } from "./provider-runtime.ts";
import { executorModules } from "./registry.generated.ts";

/**
 * Loads provider executor modules only when an action is executed.
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
   * Load a provider credential validator only when a connection is created.
   */
  loadCredentialValidators(service: string): Promise<CredentialValidators | undefined>;
}

/**
 * Default provider loader backed by `registry.generated.ts`.
 */
export class ProviderLoader implements IProviderLoader {
  async loadActionExecutor(
    service: string,
    actionId: string,
    providerDisplayName?: string,
  ): Promise<ActionExecutor | undefined> {
    const loadExecutors = executorModules[service];
    if (!loadExecutors) {
      return undefined;
    }

    const module = await loadExecutors();
    const executor = this._findActionExecutor(service, actionId, module.executors);
    return executor && providerDisplayName
      ? withProviderFallbackMessage(executor, providerDisplayName)
      : executor;
  }

  async loadCredentialValidators(service: string): Promise<CredentialValidators | undefined> {
    const loadExecutors = executorModules[service];
    if (!loadExecutors) {
      return undefined;
    }

    const module = await loadExecutors();
    return module.credentialValidators;
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
