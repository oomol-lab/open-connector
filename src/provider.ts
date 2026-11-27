import type { ProviderDefinition } from "./core/types.ts";
import type { ExecutorModule } from "./providers/provider-loader.ts";

/** A provider supplied by the host, for example from a separate npm package, instead of the bundled registry. */
export interface CustomProvider {
  /** Catalog entry: auth, categories and action schemas. `service` must not collide with a bundled provider. */
  definition: ProviderDefinition;
  /**
   * Loaded the first time an action, proxy, credential validator, trigger or OAuth operation of the provider runs.
   * Concurrent first uses share one call; a rejected load is retried on the next use.
   */
  load: () => Promise<ExecutorModule>;
}

export { s } from "./core/json-schema.ts";
export { defineProviderAction } from "./core/provider-definition.ts";
export { isPrivateNetworkAccessAllowed } from "./core/request.ts";
export {
  defineApiKeyProviderExecutors,
  defineBearerProviderExecutors,
  defineOAuthProviderExecutors,
  defineProviderExecutors,
} from "./providers/provider-executors.ts";
export { defineProviderProxy } from "./providers/provider-proxy.ts";
export { createProviderFetch, providerFetch, ProviderRequestError } from "./providers/provider-runtime.ts";
