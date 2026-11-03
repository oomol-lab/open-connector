import type { Hono } from "hono";

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ProviderLoader } from "../../providers/provider-loader.ts";
import { createConnectApp } from "../connect-app.ts";
import { TransitFileService } from "../files/transit-files.ts";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../storage/sqlite/runtime-store.ts";
import { signAccessToken, verifyAccessToken } from "./jwks.ts";
import { MemoryRateLimiter } from "./routes.ts";

// Regression tests for the CodeRabbit review of the inbound OAuth slice:
// consent Origin behind a TLS-terminating proxy, rate-limiter memory sweep,
// audience enforcement at /mcp, RFC 8707 invalid_target, and admin scope
// validation. Flow-level coverage lives in flow.test.ts.
const ISSUER = "https://connect.example";
const REDIRECT = "http://127.0.0.1:9375/callback";
const ADMIN_TOKEN = "admin-secret";

async function setup(): Promise<{ app: Hono; database: SqliteRuntimeDatabase }> {
  const database = new SqliteRuntimeDatabase(":memory:");
  const { app } = await createConnectApp({
    catalog: createCatalogStore([]),
    providerLoader: new ProviderLoader({}),
    runtimeDatabase: database,
    publicOrigin: ISSUER,
    configuredOrigin: ISSUER,
    secretCodec: new AesGcmSecretCodec("test-key"),
    adminToken: ADMIN_TOKEN,
    authMode: "mixed",
    oauth: { enabled: true, issuer: ISSUER },
    transitFiles: new TransitFileService({
      rootDir: ".tmp/oauth-routes-tests",
      publicOrigin: ISSUER,
      ttlSeconds: 60,
      maxBytes: 1024 * 1024,
    }),
  });
  return { app, database };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

interface HonoApp {
  request(input: string | URL | Request, init?: RequestInit): Promise<Response> | Response;
}

async function createManualClient(app: HonoApp): Promise<string> {
  const response = await app.request(`${ISSUER}/api/oauth-clients`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      clientName: "ChatGPT",
      redirectUris: [REDIRECT],
      tokenEndpointAuthMethod: "none",
      scopes: ["mcp:access"],
    }),
  });
  expect(response.status).toBe(201);
  const body = await readJson(response);
  const client = body.client;
  if (typeof client !== "object" || client === null || !("clientId" in client)) {
    throw new Error("client creation did not return a client record.");
  }
  return String(client.clientId);
}

const pkceVerifier = "test-verifier-with-at-least-43-characters-for-pkce-s256-aaaaaaaaaaaa";
const pkceChallenge = createHash("sha256").update(pkceVerifier, "ascii").digest("base64url");

describe("MemoryRateLimiter", () => {
  it("sweeps expired windows so the map does not grow without bound", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const limiter = new MemoryRateLimiter();
      for (let index = 0; index < 100; index += 1) {
        expect(limiter.take("bucket", `key-${index}`, 5, 60_000)).toBe(true);
      }
      // Test seam: `windows` is private; bracket access is the least invasive
      // way to assert eviction, which take() alone cannot distinguish from
      // ordinary expiry.
      const windows = limiter["windows"];
      expect(windows.size).toBe(100);

      // After the sweep interval the expired windows are evicted in bulk.
      vi.setSystemTime(61_000);
      expect(limiter.take("bucket", "fresh", 5, 60_000)).toBe(true);
      expect(windows.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sweeps at most once per interval", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const limiter = new MemoryRateLimiter();
      expect(limiter.take("bucket", "seed", 5, 1_000)).toBe(true);
      const windows = limiter["windows"];

      // Within the same sweep interval, an expired window is not yet evicted.
      vi.setSystemTime(500);
      expect(limiter.take("bucket", "short", 5, 100)).toBe(true);
      vi.setSystemTime(1_000);
      expect(limiter.take("bucket", "other", 5, 60_000)).toBe(true);
      expect(windows.size).toBe(3);

      // The next take past the sweep interval (60s after the first sweep)
      // triggers the eviction of everything expired by then.
      vi.setSystemTime(61_000);
      expect(limiter.take("bucket", "another", 5, 60_000)).toBe(true);
      expect(windows.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("consent origin check", () => {
  it("accepts the consent POST when the browser Origin is the issuer origin behind a proxy", async () => {
    const { app } = await setup();
    const clientId = await createManualClient(app);
    // TLS-terminating proxy: browsers send https:// Origin, the node server
    // sees http://internal:3000.
    const authorizeUrl = new URL("http://internal:3000/oauth/mcp/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT);
    authorizeUrl.searchParams.set("scope", "mcp:access");
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    const consent = await app.request(authorizeUrl, { redirect: "manual" });
    expect(consent.status).toBe(200);
    const page = await consent.text();
    const handle = /name="handle" value="([^"]+)"/.exec(page)?.[1];
    expect(handle).toBeTruthy();

    const approved = await app.request("http://internal:3000/oauth/mcp/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ISSUER },
      body: new URLSearchParams({ handle: handle ?? "", decision: "approve", admin_token: ADMIN_TOKEN }).toString(),
      redirect: "manual",
    });
    expect(approved.status).toBe(302);
    expect(new URL(approved.headers.get("location") ?? "").searchParams.get("code")).toBeTruthy();
  });

  it("still rejects a cross-origin consent POST with 403", async () => {
    const { app } = await setup();
    const clientId = await createManualClient(app);
    const response = await app.request(`${ISSUER}/oauth/mcp/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
      body: new URLSearchParams({ handle: "whatever", decision: "approve", admin_token: ADMIN_TOKEN }).toString(),
    });
    expect(response.status).toBe(403);
  });
});

describe("resource validation (RFC 8707)", () => {
  it("redirects with invalid_target for a resource this server does not serve", async () => {
    const { app } = await setup();
    const clientId = await createManualClient(app);
    const authorizeUrl = new URL(`${ISSUER}/oauth/mcp/authorize`);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT);
    authorizeUrl.searchParams.set("scope", "mcp:access");
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("resource", "https://other-api.example/mcp");
    const response = await app.request(authorizeUrl, { redirect: "manual" });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("invalid_target");
    expect(location.searchParams.get("state")).toBeNull();
  });
});

describe("access-token audience enforcement", () => {
  it("rejects a token minted for another resource at verify time", async () => {
    const { database } = await setup();
    const key = await database.oauthSigningKeyStore.active();
    const foreign = await signAccessToken({
      key,
      issuer: ISSUER,
      audience: "https://other-api.example/mcp",
      clientId: "mcp_foreign",
      scope: "mcp:access",
      runtimeTokenId: "rt-1",
      ttlSeconds: 60,
      tokenId: "t-1",
    });
    expect(await verifyAccessToken(foreign.token, database.oauthSigningKeyStore, ISSUER)).toBeUndefined();

    const own = await signAccessToken({
      key,
      issuer: ISSUER,
      audience: `${ISSUER}/mcp`,
      clientId: "mcp_own",
      scope: "mcp:access",
      runtimeTokenId: "rt-2",
      ttlSeconds: 60,
      tokenId: "t-2",
    });
    const verified = await verifyAccessToken(own.token, database.oauthSigningKeyStore, ISSUER);
    expect(verified?.claims.clientId).toBe("mcp_own");
  });
});

describe("admin client scope validation", () => {
  it("rejects unsupported scopes on create with invalid_input", async () => {
    const { app } = await setup();
    const response = await app.request(`${ISSUER}/api/oauth-clients`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({
        clientName: "ChatGPT",
        redirectUris: [REDIRECT],
        tokenEndpointAuthMethod: "none",
        scopes: ["mcp:access", "shop:read"],
      }),
    });
    expect(response.status).toBe(400);
    const body = await readJson(response);
    const error = body.error;
    if (typeof error !== "object" || error === null || !("code" in error) || !("message" in error)) {
      throw new Error("expected an error envelope.");
    }
    expect(error.code).toBe("invalid_input");
    expect(String(error.message)).toContain("shop:read");
  });

  it("rejects unsupported scopes on update with invalid_input", async () => {
    const { app } = await setup();
    const clientId = await createManualClient(app);
    const response = await app.request(`${ISSUER}/api/oauth-clients/${clientId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ scopes: ["offline_access", "catalog:write"] }),
    });
    expect(response.status).toBe(400);
    const body = await readJson(response);
    const error = body.error;
    if (typeof error !== "object" || error === null || !("code" in error)) {
      throw new Error("expected an error envelope.");
    }
    expect(error.code).toBe("invalid_input");
  });
});
