import { describe, expect, it } from "vitest";
import { tailscaleOperations, tailscaleUnsupportedOAuthClientOperations } from "./operations.ts";

describe("Tailscale official API coverage", () => {
  it("accounts for all official operations and excludes endpoints unavailable to OAuth clients", () => {
    expect(tailscaleOperations).toHaveLength(82);
    expect(tailscaleUnsupportedOAuthClientOperations).toHaveLength(8);
    expect(tailscaleOperations.length + tailscaleUnsupportedOAuthClientOperations.length).toBe(90);
    expect(new Set(tailscaleOperations.map((operation) => operation.name)).size).toBe(82);
    expect(tailscaleOperations.every((operation) => operation.requiredScopes.length > 0)).toBe(true);
  });
});
