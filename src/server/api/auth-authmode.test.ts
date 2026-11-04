import type { RuntimeGrant } from "../storage/runtime-token-service.ts";

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createLocalAuthMiddleware } from "./auth.ts";

const grant: RuntimeGrant = { tokenId: "oauth-token-1", allowedActions: [], blockedActions: [], allowedProxies: [] };

function buildApp(options: Parameters<typeof createLocalAuthMiddleware>[0]): Hono {
  const app = new Hono();
  app.use("*", createLocalAuthMiddleware(options));
  app.post("/mcp", (context) => context.json({ ok: true }));
  app.get("/v1", (context) => context.json({ ok: true }));
  app.get("/oauth/jwks", (context) => context.json({ keys: [] }));
  return app;
}

describe("runtime authMode", () => {
  it("oauth mode rejects a configured static runtime token", async () => {
    const app = buildApp({
      runtimeToken: "oct_static",
      authMode: "oauth",
      resolveOAuthToken: async (token) => (token === "oauth-access" ? grant : undefined),
    });
    expect(
      (await app.request("/mcp", { method: "POST", headers: { authorization: "Bearer oct_static" } })).status,
    ).toBe(401);
    expect(
      (await app.request("/mcp", { method: "POST", headers: { authorization: "Bearer oauth-access" } })).status,
    ).toBe(200);
  });

  it("oauth mode without OAuth configuration does not fall back to unauthenticated", async () => {
    const app = buildApp({ authMode: "oauth" });
    expect((await app.request("/mcp", { method: "POST" })).status).toBe(401);
    expect((await app.request("/v1")).status).toBe(401);
  });

  it("runtime_token mode with OAuth enabled does not force auth when no runtime credentials exist", async () => {
    const app = buildApp({
      authMode: "runtime_token",
      resolveOAuthToken: async (token) => (token === "oauth-access" ? grant : undefined),
    });
    expect((await app.request("/v1")).status).toBe(200);
    expect((await app.request("/mcp", { method: "POST" })).status).toBe(200);
  });

  it("runtime_token mode with a static token rejects OAuth access tokens", async () => {
    const app = buildApp({
      runtimeToken: "oct_static",
      authMode: "runtime_token",
      resolveOAuthToken: async (token) => (token === "oauth-access" ? grant : undefined),
    });
    expect(
      (await app.request("/mcp", { method: "POST", headers: { authorization: "Bearer oauth-access" } })).status,
    ).toBe(401);
    expect(
      (await app.request("/mcp", { method: "POST", headers: { authorization: "Bearer oct_static" } })).status,
    ).toBe(200);
  });

  it("mixed mode accepts both runtime tokens and OAuth access tokens", async () => {
    const app = buildApp({
      runtimeToken: "oct_static",
      authMode: "mixed",
      resolveRuntimeToken: async (token) =>
        token === "oct_stored"
          ? { tokenId: "t", allowedActions: [], blockedActions: [], allowedProxies: [] }
          : undefined,
      resolveOAuthToken: async (token) => (token === "oauth-access" ? grant : undefined),
    });
    expect(
      (await app.request("/mcp", { method: "POST", headers: { authorization: "Bearer oct_static" } })).status,
    ).toBe(200);
    expect(
      (await app.request("/mcp", { method: "POST", headers: { authorization: "Bearer oct_stored" } })).status,
    ).toBe(200);
    expect(
      (await app.request("/mcp", { method: "POST", headers: { authorization: "Bearer oauth-access" } })).status,
    ).toBe(200);
    expect((await app.request("/mcp", { method: "POST" })).status).toBe(401);
  });

  it("none mode leaves runtime endpoints unauthenticated", async () => {
    const app = buildApp({ authMode: "none", runtimeToken: "oct_static" });
    expect((await app.request("/mcp", { method: "POST" })).status).toBe(200);
    expect((await app.request("/v1")).status).toBe(200);
  });

  it("serves /oauth/jwks without admin or runtime credentials", async () => {
    const app = buildApp({ adminToken: "admin-secret", runtimeToken: "oct_static" });
    expect((await app.request("/oauth/jwks")).status).toBe(200);
  });
});
