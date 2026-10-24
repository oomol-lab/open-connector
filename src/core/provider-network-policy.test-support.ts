import { vi } from "vitest";
import * as network from "./provider-network-policy.ts";

export function setPrivateNetworkAccessAllowed(allowPrivateNetwork: boolean): void {
  vi.spyOn(network, "getProviderNetworkPolicy").mockReturnValue({
    ...network.getProviderNetworkPolicy(),
    allowPrivateNetwork,
  });
}

export function setEgressTrustedHosts(trustedHosts: readonly string[]): void {
  vi.spyOn(network, "getProviderNetworkPolicy").mockReturnValue({
    ...network.getProviderNetworkPolicy(),
    trustedHosts,
  });
}
