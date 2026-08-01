import { describe, expect, it } from "vitest";
import { connectSessionAllowsService, ConnectSessionService } from "./connect-session.ts";

const service = new ConnectSessionService("session-secret", 60);

describe("ConnectSessionService", () => {
  it("round-trips the claims it was minted with", () => {
    const { token } = service.create({
      tenant: "tenant-a",
      allowedServices: ["github"],
      connectionName: "work",
    });

    expect(service.verify(token)).toMatchObject({
      ok: true,
      claims: { tenant: "tenant-a", allowedServices: ["github"], connectionName: "work" },
    });
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = new ConnectSessionService("other-secret", 60).create({
      tenant: "tenant-a",
      allowedServices: ["github"],
    });

    expect(service.verify(token)).toMatchObject({ ok: false, code: "invalid_session_token" });
  });

  it("rejects a tampered tenant", () => {
    // The point of signing: an end user holds this token in their browser, so editing
    // the tenant must not let them connect into someone else's.
    const { token } = service.create({ tenant: "tenant-a", allowedServices: ["github"] });
    const [body, signature] = token.slice("ocs_".length).split(".");
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as Record<string, unknown>;
    claims.tenant = "tenant-b";
    const forged = `ocs_${Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")}.${signature}`;

    expect(service.verify(forged)).toMatchObject({ ok: false, code: "invalid_session_token" });
  });

  it("rejects a widened service allowlist", () => {
    const { token } = service.create({ tenant: "tenant-a", allowedServices: ["github"] });
    const [body, signature] = token.slice("ocs_".length).split(".");
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as Record<string, unknown>;
    claims.allowedServices = ["github", "slack"];
    const forged = `ocs_${Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")}.${signature}`;

    expect(service.verify(forged)).toMatchObject({ ok: false, code: "invalid_session_token" });
  });

  it("rejects an expired token", () => {
    const { token } = service.create({
      tenant: "tenant-a",
      allowedServices: ["github"],
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(service.verify(token, new Date("2026-01-01T00:00:00.000Z"))).toMatchObject({ ok: true });
    expect(service.verify(token, new Date("2026-01-01T00:02:00.000Z"))).toMatchObject({
      ok: false,
      code: "session_token_expired",
    });
  });

  it("rejects malformed tokens without throwing", () => {
    for (const token of ["", "not-a-token", "ocs_", "ocs_only-a-body", "ocs_!!!.!!!"]) {
      expect(service.verify(token).ok).toBe(false);
    }
  });

  it("does not embed a credential or admin secret in the token", () => {
    const { token } = service.create({ tenant: "tenant-a", allowedServices: ["github"] });

    expect(token).not.toContain("session-secret");
  });
});

describe("connectSessionAllowsService", () => {
  it("permits only the listed services", () => {
    const claims = { tenant: "t", allowedServices: ["github"], expiresAt: "2099-01-01T00:00:00.000Z" };

    expect(connectSessionAllowsService(claims, "github")).toBe(true);
    expect(connectSessionAllowsService(claims, "slack")).toBe(false);
  });

  it("permits nothing when the allowlist is empty", () => {
    // An empty list must never be read as "all services".
    const claims = { tenant: "t", allowedServices: [], expiresAt: "2099-01-01T00:00:00.000Z" };

    expect(connectSessionAllowsService(claims, "github")).toBe(false);
  });
});
