import { describe, expect, it } from "vitest";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { normalizeBaseUrl } from "./executors.ts";

describe("normalizeBaseUrl", () => {
  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(normalizeBaseUrl("https://10.0.0.5")).toBe("https://10.0.0.5");
    });
  });

  it("rejects reserved metadata targets even with the deployment opt-in", () => {
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(() => normalizeBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
    });
  });

  it("rejects embedded credentials", () => {
    expect(() => normalizeBaseUrl("https://api-key@example.easy8.com")).toThrow("must not include credentials");
  });
});
