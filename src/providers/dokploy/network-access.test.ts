import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { normalizeDokployApiBaseUrl } from "./runtime.ts";

// Tests mutate the deployment-level private-network flag; reset it to the secure
// default after each case so state never leaks between tests.
afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("Dokploy private-network access", () => {
  it("rejects private and overlay targets by default (public-only guard)", () => {
    for (const value of [
      "http://10.0.0.2:3000",
      "http://172.16.0.2:3000",
      "http://192.168.1.2:3000",
      "http://100.64.0.2:3000",
      "http://dokploy.internal:3000",
    ]) {
      expect(() => normalizeDokployApiBaseUrl(value)).toThrow();
    }
  });

  it("allows RFC 1918, Tailscale, NetBird, and private hostname targets when the deployment enables private networks", () => {
    setPrivateNetworkAccessAllowed(true);
    for (const value of [
      "http://10.0.0.2:3000",
      "http://172.16.0.2:3000",
      "http://192.168.1.2:3000",
      "http://100.64.0.2:3000",
      "https://10.0.0.2:3000",
      "http://dokploy.internal:3000",
    ]) {
      expect(normalizeDokployApiBaseUrl(value)).toBe(`${value}/api`);
    }
  });

  it("keeps unsafe local, link-local, and metadata targets blocked even when private networks are enabled", () => {
    setPrivateNetworkAccessAllowed(true);
    for (const value of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://100.100.100.200",
      "http://169.254.169.254",
    ]) {
      expect(() => normalizeDokployApiBaseUrl(value)).toThrow();
    }
  });

  it("honors an explicit allowPrivateNetwork override regardless of the deployment default", () => {
    // Flag off, explicit allow -> accepted.
    expect(normalizeDokployApiBaseUrl("http://10.0.0.2:3000", true)).toBe("http://10.0.0.2:3000/api");
    // Flag on, explicit disallow -> rejected.
    setPrivateNetworkAccessAllowed(true);
    expect(() => normalizeDokployApiBaseUrl("http://10.0.0.2:3000", false)).toThrow();
  });
});
