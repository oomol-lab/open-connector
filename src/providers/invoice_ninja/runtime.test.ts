import { describe, expect, it } from "vitest";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { normalizeInvoiceNinjaUrls } from "./runtime.ts";

describe("normalizeInvoiceNinjaUrls", () => {
  it("allows a public host and keeps the /api/v1 suffix on the API base", () => {
    expect(normalizeInvoiceNinjaUrls("https://ninja.example.com/api/v1")).toEqual({
      instanceUrl: "https://ninja.example.com",
      apiBaseUrl: "https://ninja.example.com/api/v1",
    });
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeInvoiceNinjaUrls("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(normalizeInvoiceNinjaUrls("https://10.0.0.5")).toEqual({
        instanceUrl: "https://10.0.0.5",
        apiBaseUrl: "https://10.0.0.5/api/v1",
      });
    });
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(() => normalizeInvoiceNinjaUrls("https://169.254.169.254")).toThrow("private or reserved IP addresses");
      expect(() => normalizeInvoiceNinjaUrls("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
      expect(() => normalizeInvoiceNinjaUrls("https://metadata.google.internal")).toThrow("cloud metadata hosts");
    });
  });
});
