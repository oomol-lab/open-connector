import type { ProviderDispatchContext, ProviderHttpDispatchOptions } from "./provider-http-dispatch.ts";
import type { ProviderNetworkPolicy } from "./provider-network-policy.ts";

import { withProviderHttpDispatch } from "./provider-http-dispatch.ts";
import { getProviderNetworkPolicy, withProviderNetworkPolicy } from "./provider-network-policy.ts";

export interface RuntimeExecutionOptions {
  network?: ProviderNetworkPolicy;
  providerHttpDispatch?: ProviderHttpDispatchOptions;
}

/** Entry boundary shared by requests, direct runner calls, initialization and maintenance. */
export function withRuntimeExecution<T>(
  options: RuntimeExecutionOptions,
  context: ProviderDispatchContext,
  work: () => T,
): T {
  return withProviderNetworkPolicy(options.network ?? getProviderNetworkPolicy(), () =>
    withProviderHttpDispatch(context, work, options.providerHttpDispatch),
  );
}
