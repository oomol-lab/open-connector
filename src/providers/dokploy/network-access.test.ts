import { describe, expect, it } from "vitest";
import { normalizeDokployApiBaseUrl, parseDokployAllowPrivateNetwork } from "./runtime.ts";

describe("Dokploy private-network access", () => {
  it("keeps private networks denied by default", () => {
    for (const value of ["http://10.0.0.2:3000", "http://100.64.0.2:3000", "http://dokploy.internal:3000"]) {
      expect(() => normalizeDokployApiBaseUrl(value)).toThrow();
    }
  });

  it("allows trusted RFC 1918, Tailscale, NetBird, and private hostname targets when enabled", () => {
    for (const value of ["http://10.0.0.2:3000", "http://100.64.0.2:3000", "http://dokploy.internal:3000"]) {
      expect(normalizeDokployApiBaseUrl(value, true)).toBe(`${value}/api`);
    }
  });

  it("does not allow the opt-in to reach local or link-local targets", () => {
    for (const value of ["http://localhost:3000", "http://127.0.0.1:3000", "http://169.254.169.254"]) {
      expect(() => normalizeDokployApiBaseUrl(value, true)).toThrow();
    }
  });

  it("requires an explicit boolean-like credential value", () => {
    expect(parseDokployAllowPrivateNetwork(undefined)).toBe(false);
    expect(parseDokployAllowPrivateNetwork("false")).toBe(false);
    expect(parseDokployAllowPrivateNetwork(" TRUE ")).toBe(true);
    expect(() => parseDokployAllowPrivateNetwork("yes")).toThrow("must be true or false");
  });
});
