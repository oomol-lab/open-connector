import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createLocalAuthMiddleware } from "./auth.ts";

describe("createLocalAuthMiddleware", () => {
  it("fails closed when a runtime token resolver is configured without a token-count callback", async () => {
    const app = new Hono();
    app.use(
      "*",
      createLocalAuthMiddleware({
        resolveRuntimeToken: async (token) =>
          token === "runtime-token"
            ? { tokenId: "token-1", allowedActions: [], blockedActions: [], allowedProxies: [] }
            : undefined,
      }),
    );
    app.get("/v1", (context) => context.json({ ok: true }));
    app.get("/v1/actions", (context) => context.json({ ok: true }));
    app.get("/mcp-not-runtime", (context) => context.json({ ok: true }));

    expect((await app.request("/v1")).status).toBe(401);
    expect((await app.request("/v1/actions")).status).toBe(401);
    expect(
      (
        await app.request("/v1/actions", {
          headers: { authorization: "Bearer runtime-token" },
        })
      ).status,
    ).toBe(200);
    expect((await app.request("/mcp-not-runtime")).status).toBe(200);
  });

  it("does not open POST /v1/actions when runtime tokens exist but admin token is unset", async () => {
    const app = new Hono();
    app.use(
      "*",
      createLocalAuthMiddleware({
        hasRuntimeTokens: async () => true,
        resolveRuntimeToken: async (token) =>
          token === "oct_valid"
            ? { tokenId: "token-1", allowedActions: [], blockedActions: [], allowedProxies: [] }
            : undefined,
      }),
    );
    app.post("/v1/actions/:actionId", (context) => context.json({ ok: true, actionId: context.req.param("actionId") }));
    app.get("/v1/actions", (context) => context.json({ ok: true }));

    expect((await app.request("/v1/actions")).status).toBe(401);
    expect(
      (
        await app.request("/v1/actions/example.echo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: {} }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request("/v1/actions/example.echo", {
          method: "POST",
          headers: {
            authorization: "Bearer oct_valid",
            "content-type": "application/json",
          },
          body: JSON.stringify({ input: {} }),
        })
      ).status,
    ).toBe(200);
  });

  it.each(["Bearer", "bearer", "BEARER", "BeArEr"])(
    "accepts the %s authorization scheme on every auth scope",
    async (scheme) => {
      const app = createSchemeApp();

      expect((await app.request("/api/connections", { headers: authorize(scheme, "admin-secret") })).status).toBe(200);
      expect((await app.request("/v1/actions", { headers: authorize(scheme, "runtime-secret") })).status).toBe(200);
      expect((await app.request("/mcp/tools", { headers: authorize(scheme, "runtime-secret") })).status).toBe(200);
    },
  );

  it.each([
    "Basic admin-secret",
    "BearerX admin-secret",
    "Bearer-Foo admin-secret",
    "Bearer",
    "Bearer\tadmin-secret",
    // A case-insensitive scheme must not loosen anything else: the credentials stay
    // case-sensitive and are still matched byte-for-byte after a single separator space.
    "bearer admin-Secret",
    "bearer  admin-secret",
  ])("rejects the %j authorization header", async (authorization) => {
    const app = createSchemeApp();

    expect((await app.request("/api/connections", { headers: { authorization } })).status).toBe(401);
  });

  it("issues the admin session cookie for a lowercase bearer scheme", async () => {
    const app = createSchemeApp();

    const response = await app.request("/api/connections", {
      headers: authorize("bearer", "admin-secret"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("oomol_connect_admin_session=");
    expect(response.headers.get("set-cookie")).not.toContain("admin-secret");
  });

  it("resolves dynamic runtime tokens for a lowercase bearer scheme", async () => {
    const resolveRuntimeToken = vi.fn(async (token: string) =>
      token === "oct_valid"
        ? { tokenId: "token-1", allowedActions: [], blockedActions: [], allowedProxies: [] }
        : undefined,
    );
    const app = new Hono();
    app.use("*", createLocalAuthMiddleware({ hasRuntimeTokens: async () => true, resolveRuntimeToken }));
    app.get("/v1/actions", (context) => context.json({ ok: true }));

    const response = await app.request("/v1/actions", { headers: authorize("bearer", "oct_valid") });

    expect(response.status).toBe(200);
    expect(resolveRuntimeToken).toHaveBeenCalledWith("oct_valid");
  });

  it("allows configured admin tokens to elevate POST /v1/actions", async () => {
    const app = new Hono();
    app.use(
      "*",
      createLocalAuthMiddleware({
        adminToken: "admin-secret",
        hasRuntimeTokens: async () => true,
        resolveRuntimeToken: async () => undefined,
      }),
    );
    app.post("/v1/actions/:actionId", (context) => context.json({ ok: true }));

    expect(
      (
        await app.request("/v1/actions/example.echo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: {} }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request("/v1/actions/example.echo", {
          method: "POST",
          headers: {
            authorization: "Bearer admin-secret",
            "content-type": "application/json",
          },
          body: JSON.stringify({ input: {} }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request("/v1/actions/example.echo", {
          method: "POST",
          headers: { ...authorize("BEARER", "admin-secret"), "content-type": "application/json" },
          body: JSON.stringify({ input: {} }),
        })
      ).status,
    ).toBe(200);
  });

  it("matches configured tokens byte-for-byte after the bearer scheme", async () => {
    const app = new Hono();
    app.use("*", createLocalAuthMiddleware({ adminToken: "admin-secret", runtimeToken: "runtime-secret" }));
    app.get("/api/connections", (context) => context.json({ ok: true }));
    app.get("/v1/actions", (context) => context.json({ ok: true }));

    const adminStatus = async (authorization: string): Promise<number> =>
      (await app.request("/api/connections", { headers: { authorization } })).status;

    expect(await adminStatus("Bearer admin-secret")).toBe(200);
    // Same length as the configured token, so a length check alone cannot reject it.
    expect(await adminStatus("Bearer admin-secreT")).toBe(401);
    expect(await adminStatus("Bearer admin-secre")).toBe(401);
    expect(await adminStatus("Bearer admin-secret-extra")).toBe(401);
    expect(await adminStatus("Bearer  admin-secret")).toBe(401);
    expect(await adminStatus("admin-secret")).toBe(401);
    // The runtime bootstrap token must not unlock the admin surface, and vice versa.
    expect(await adminStatus("Bearer runtime-secret")).toBe(401);
    expect((await app.request("/v1/actions", { headers: { authorization: "Bearer runtime-secret" } })).status).toBe(
      200,
    );
    expect((await app.request("/v1/actions", { headers: { authorization: "Bearer runtime-secreT" } })).status).toBe(
      401,
    );
  });
});

function createSchemeApp(): Hono {
  const app = new Hono();
  app.use("*", createLocalAuthMiddleware({ adminToken: "admin-secret", runtimeToken: "runtime-secret" }));
  app.get("/api/connections", (context) => context.json({ ok: true }));
  app.get("/v1/actions", (context) => context.json({ ok: true }));
  app.get("/mcp/tools", (context) => context.json({ ok: true }));
  return app;
}

function authorize(scheme: string, token: string): Record<string, string> {
  return { authorization: `${scheme} ${token}` };
}
