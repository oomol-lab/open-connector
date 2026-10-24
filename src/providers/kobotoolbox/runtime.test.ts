import { describe, expect, it } from "vitest";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { normalizeKoboToolboxBaseUrl } from "./runtime.ts";

describe("normalizeKoboToolboxBaseUrl", () => {
  it("allows a public host and drops the trailing slash", () => {
    expect(normalizeKoboToolboxBaseUrl("https://kf.kobotoolbox.org/")).toBe("https://kf.kobotoolbox.org");
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeKoboToolboxBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(normalizeKoboToolboxBaseUrl("https://10.0.0.5")).toBe("https://10.0.0.5");
    });
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(() => normalizeKoboToolboxBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
      expect(() => normalizeKoboToolboxBaseUrl("https://[::ffff:169.254.169.254]/")).toThrow("IPv6");
      expect(() => normalizeKoboToolboxBaseUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
    });
  });

  it("keeps requiring https and a server root URL without a path", () => {
    expect(() => normalizeKoboToolboxBaseUrl("http://kf.kobotoolbox.org")).toThrow("baseUrl must use https");
    expect(() => normalizeKoboToolboxBaseUrl("https://kf.kobotoolbox.org/api/v2")).toThrow(
      "baseUrl must be the KoboToolbox server root URL without a path",
    );
    expect(() => normalizeKoboToolboxBaseUrl("")).toThrow("baseUrl is required");
  });
});
