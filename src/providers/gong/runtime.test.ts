import { describe, expect, it } from "vitest";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { normalizeGongApiBaseUrl } from "./runtime.ts";

describe("normalizeGongApiBaseUrl", () => {
  it("rejects private tenant URLs even when private-network access is enabled", () => {
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(() => normalizeGongApiBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");
    });
  });

  it("rejects cloud metadata hosts even when private-network access is enabled", () => {
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(() => normalizeGongApiBaseUrl("https://metadata")).toThrow("cloud metadata hosts");
    });
  });
});
