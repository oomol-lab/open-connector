import { describe, expect, it } from "vitest";
import { normalizeDokployApiBaseUrl } from "./runtime.ts";

describe("Dokploy private-network access", () => {
  it("allows RFC 1918, Tailscale, NetBird, and private hostname targets by default", () => {
    for (const value of ["http://10.0.0.2:3000", "http://100.64.0.2:3000", "http://dokploy.internal:3000"]) {
      expect(normalizeDokployApiBaseUrl(value)).toBe(`${value}/api`);
    }
  });

  it("does not allow unsafe local, link-local, or metadata targets", () => {
    for (const value of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://100.100.100.200",
      "http://169.254.169.254",
    ]) {
      expect(() => normalizeDokployApiBaseUrl(value)).toThrow();
    }
  });
});
