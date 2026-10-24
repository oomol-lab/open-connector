import { describe, expect, it } from "vitest";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { resolveHomeAssistantBaseUrl } from "./runtime.ts";

describe("resolveHomeAssistantBaseUrl", () => {
  it("allows a public host", () => {
    expect(resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://ha.example.com" } })).toBe(
      "https://ha.example.com",
    );
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://10.0.0.5:8123" } })).toThrow(
      "private or reserved IP addresses",
    );

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://10.0.0.5:8123" } })).toBe(
        "https://10.0.0.5:8123",
      );
    });
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(() => resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://169.254.169.254" } })).toThrow(
        "private or reserved IP addresses",
      );
      expect(() => resolveHomeAssistantBaseUrl({ values: { baseUrl: "http://[::ffff:169.254.169.254]/" } })).toThrow(
        "IPv6",
      );
      expect(() => resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://metadata.google.internal" } })).toThrow(
        "cloud metadata hosts",
      );
    });
  });
});
