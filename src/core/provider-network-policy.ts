import { AsyncLocalStorage } from "node:async_hooks";

/** Runtime-owned egress permissions; never populate them from provider input. */
export interface ProviderNetworkPolicy {
  /**
   * Runtime permission read by isPrivateNetworkAccessAllowed(). Binding this policy
   * alone does not relax fetch targets: the provider must also opt in through its
   * transport's allowPrivateNetwork callback. Reserved targets stay blocked.
   */
  readonly allowPrivateNetwork?: boolean;
  /** Hosts whose DNS answers may use private or VPN-mapped ranges. */
  readonly trustedHosts?: readonly string[];
}

const scopes = new AsyncLocalStorage<ProviderNetworkPolicy>();
const publicNetworkPolicy: ProviderNetworkPolicy = Object.freeze({});

/** The active runtime's policy, or public-only access outside a runtime. */
export function getProviderNetworkPolicy(): ProviderNetworkPolicy {
  return scopes.getStore() ?? publicNetworkPolicy;
}

/** Bind policy to asynchronous work, including provider callbacks and non-HTTP transports. */
export function withProviderNetworkPolicy<T>(policy: ProviderNetworkPolicy, work: () => T): T {
  return scopes.run(policy, work);
}
