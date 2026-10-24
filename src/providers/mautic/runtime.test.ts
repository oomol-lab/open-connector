import { describe, expect, it } from "vitest";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { normalizeMauticBaseUrl } from "./runtime.ts";

describe("normalizeMauticBaseUrl", () => {
  it("allows a public host and appends /api/", () => {
    expect(normalizeMauticBaseUrl("https://mautic.example.com")).toBe("https://mautic.example.com/api/");
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeMauticBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(normalizeMauticBaseUrl("https://10.0.0.5")).toBe("https://10.0.0.5/api/");
    });
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(() => normalizeMauticBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
      expect(() => normalizeMauticBaseUrl("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
      expect(() => normalizeMauticBaseUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
    });
  });
});
