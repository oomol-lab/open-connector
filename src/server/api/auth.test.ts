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
});
