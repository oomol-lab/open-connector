import { Hono } from "hono";
import { describe, expect, it } from "vitest";
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
