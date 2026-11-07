import type { Hono } from "hono";

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ProviderLoader } from "../../providers/provider-loader.ts";
import { createConnectApp } from "../connect-app.ts";
import { TransitFileService } from "../files/transit-files.ts";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { RuntimeTokenService } from "../storage/runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "../storage/sqlite/runtime-store.ts";

// End-to-end authorization-code flow against the real Hono app and the
// in-memory sqlite stores: discovery, PKCE exchange, refresh, revocation, and
// the RuntimeGrant bridge that lets an OAuth access token reach /mcp.
const ISSUER = "https://connect.example";
const REDIRECT = "http://127.0.0.1:9375/callback";
const ADMIN_TOKEN = "admin-secret";

interface SetupOptions {
  authMode?: "none" | "runtime_token" | "oauth" | "mixed";
}

async function setup(options: SetupOptions = {}): Promise<{ app: Hono; database: SqliteRuntimeDatabase }> {
  const database = new SqliteRuntimeDatabase(":memory:");
  const { app } = await createConnectApp({
    catalog: createCatalogStore([]),
    providerLoader: new ProviderLoader({}),
    runtimeDatabase: database,
    publicOrigin: ISSUER,
    configuredOrigin: ISSUER,
    secretCodec: new AesGcmSecretCodec("test-key"),
    adminToken: ADMIN_TOKEN,
    authMode: options.authMode ?? "mixed",
    oauth: { enabled: true, issuer: ISSUER },
    transitFiles: new TransitFileService({
      rootDir: ".tmp/oauth-flow-tests",
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

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = "test-verifier-with-at-least-43-characters-for-pkce-s256-aaaaaaaaaaaa";
  return { verifier, challenge: createHash("sha256").update(verifier, "ascii").digest("base64url") };
}

interface HonoApp {
  request(input: string | URL | Request, init?: RequestInit): Promise<Response> | Response;
}

async function createManualClient(
  app: HonoApp,
  tokenEndpointAuthMethod: "none" | "client_secret_basic" = "none",
): Promise<{ clientId: string; clientSecret?: string }> {
  const response = await app.request(`${ISSUER}/api/oauth-clients`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      clientName: "ChatGPT",
      redirectUris: [REDIRECT, "https://chatgpt.com/connector_platform_oauth_redirect"],
      tokenEndpointAuthMethod,
      scopes: ["mcp:access", "offline_access"],
    }),
  });
  expect(response.status).toBe(201);
  const body = await readJson(response);
  const client = body.client as { clientId: string };
  return { clientId: client.clientId, clientSecret: body.clientSecret as string | undefined };
}

async function authorizeAndApprove(
  app: HonoApp,
  clientId: string,
  scope = "mcp:access offline_access",
  resource?: string,
  pair?: { verifier: string; challenge: string },
): Promise<{ location: URL; verifier: string }> {
  const generated = pkcePair();
  const verifier = pair?.verifier ?? generated.verifier;
  const codeChallenge = pair?.challenge ?? generated.challenge;
  const authorizeUrl = new URL(`${ISSUER}/oauth/mcp/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  if (resource !== undefined) {
    authorizeUrl.searchParams.set("resource", resource);
  }
  authorizeUrl.searchParams.set("state", "client-state-123");
  const consent = await app.request(authorizeUrl, { redirect: "manual" });
  expect(consent.status).toBe(200);
  const page = await consent.text();
  const handle = /name="handle" value="([^"]+)"/.exec(page)?.[1];
  expect(handle).toBeTruthy();
  const approved = await app.request(`${ISSUER}/oauth/mcp/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: ISSUER },
    body: new URLSearchParams({ handle: handle ?? "", decision: "approve", admin_token: ADMIN_TOKEN }).toString(),
    redirect: "manual",
  });
  expect(approved.status).toBe(302);
  const location = new URL(approved.headers.get("location") ?? "");
  expect(location.searchParams.get("iss")).toBe(ISSUER);
  expect(location.searchParams.get("state")).toBe("client-state-123");
  return { location, verifier };
}

async function exchangeCode(app: HonoApp, clientId: string, code: string, verifier?: string): Promise<Response> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
  });
  if (verifier !== undefined) {
    form.set("code_verifier", verifier);
  }
  return app.request(`${ISSUER}/oauth/mcp/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

describe("oauth discovery", () => {
  it("serves PRM and AS metadata on the well-known paths", async () => {
    const { app } = await setup();
    const prm = await app.request(`${ISSUER}/.well-known/oauth-protected-resource/mcp`);
    expect(prm.status).toBe(200);
    const prmBody = await readJson(prm);
    expect(prmBody.resource).toBe(`${ISSUER}/mcp`);
    expect(prmBody.authorization_servers).toEqual([ISSUER]);

    const asMetadata = await app.request(`${ISSUER}/.well-known/oauth-authorization-server`);
    const asBody = await readJson(asMetadata);
    expect(asBody.code_challenge_methods_supported).toEqual(["S256"]);
    expect(asBody.client_id_metadata_document_supported).toBe(true);
    expect(asBody.registration_endpoint).toBe(`${ISSUER}/oauth/mcp/register`);
  });

  it("approval serialized against deletion mints nothing for a deleted client", async () => {
    const { app, database } = await setup();
    const clientId = (await createManualClient(app)).clientId;
    const { withClientLock } = await import("./client-lock.ts");
    const { promise: unblock, resolve: release } = Promise.withResolvers<void>();
    // Consent page first (client still live), then hold the lock, queue the
    // approve POST behind it, delete the client, and let the approval run:
    // its locked re-check must see the deletion.
    const page = await authorizeGetConsent(app, clientId);
    const handle = /name="handle" value="([^"]+)"/.exec(page)?.[1] ?? "";
    const holder = withClientLock(clientId, () => unblock);
    const approvePromise = app.request(`${ISSUER}/oauth/mcp/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ISSUER },
      body: new URLSearchParams({ handle, decision: "approve", admin_token: ADMIN_TOKEN }).toString(),
      redirect: "manual",
    });
    await database.oauthClientStore.delete(clientId);
    release();
    await holder;
    const approved = await approvePromise;
    expect(approved.status).toBe(400);
    expect(await database.oauthCodeStore.listByClient(clientId)).toHaveLength(0);
  });
});

/** Fetches the consent page HTML for a pending authorization request. */
async function authorizeGetConsent(app: HonoApp, clientId: string): Promise<string> {
  const { challenge } = pkcePair();
  const authorizeUrl = new URL(`${ISSUER}/oauth/mcp/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT);
  authorizeUrl.searchParams.set("scope", "mcp:access offline_access");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  const consent = await app.request(authorizeUrl, { redirect: "manual" });
  expect(consent.status).toBe(200);
  return consent.text();
}

describe("authorization code flow", () => {
  it("completes with PKCE, echoes resource into the token, and mints a RuntimeGrant", async () => {
    const { app, database } = await setup();
    const { clientId } = await createManualClient(app);
    const { verifier } = pkcePair();
    const { location } = await authorizeAndApprove(app, clientId, "mcp:access offline_access", `${ISSUER}/mcp`);
    const code = location.searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenResponse = await exchangeCode(app, clientId, code ?? "", verifier);
    expect(tokenResponse.status).toBe(200);
    const tokens = await readJson(tokenResponse);
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.scope).toBe("mcp:access offline_access");
    expect(typeof tokens.access_token).toBe("string");
    expect(typeof tokens.refresh_token).toBe("string");

    // The access token authenticates /mcp (empty catalog, so not a 401).
    const mcpResponse = await app.request(`${ISSUER}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${String(tokens.access_token)}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(mcpResponse.status).not.toBe(401);

    // The backing runtime token exists and is named after the client.
    const runtimeTokens = await database.runtimeTokenStore.list();
    expect(runtimeTokens).toHaveLength(1);
    expect(runtimeTokens[0]?.name).toMatch(/^MCP OAuth •/);
    expect(runtimeTokens[0]?.allowedActions).toEqual([]);
  });

  it("rejects a wrong verifier, burns the code, and rejects replay", async () => {
    const { app } = await setup();
    const { clientId } = await setupClient(app);
    const { verifier } = pkcePair();
    const { location } = await authorizeAndApprove(app, clientId);
    const code = location.searchParams.get("code") ?? "";

    const badVerifier = await exchangeCode(app, clientId, code, `${verifier.slice(0, -1)}b`);
    expect(badVerifier.status).toBe(400);
    expect((await readJson(badVerifier)).error).toBe("invalid_grant");

    // The failed attempt consumed the code (consume happens before PKCE
    // verification, so a verifier brute-force cannot proceed) and the correct
    // verifier can no longer redeem it.
    const afterBadVerifier = await exchangeCode(app, clientId, code, verifier);
    expect((await readJson(afterBadVerifier)).error).toBe("invalid_grant");
  });

  it("rejects replay of a successfully redeemed code", async () => {
    const { app } = await setup();
    const { clientId } = await setupClient(app);
    const { verifier } = pkcePair();
    const { location } = await authorizeAndApprove(app, clientId);
    const code = location.searchParams.get("code") ?? "";

    const first = await exchangeCode(app, clientId, code, verifier);
    expect(first.status).toBe(200);
    const replay = await exchangeCode(app, clientId, code, verifier);
    expect((await readJson(replay)).error).toBe("invalid_grant");
  });

  it("rejects a redirect_uri mismatch at the token endpoint", async () => {
    const { app } = await setup();
    const { clientId } = await setupClient(app);
    const { verifier } = pkcePair();
    const { location } = await authorizeAndApprove(app, clientId);
    const response = await app.request(`${ISSUER}/oauth/mcp/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: location.searchParams.get("code") ?? "",
        redirect_uri: "http://127.0.0.1:9999/other",
        client_id: clientId,
        code_verifier: verifier,
      }).toString(),
    });
    expect((await readJson(response)).error).toBe("invalid_grant");
  });
});

describe("refresh and revocation", () => {
  it("refreshes an access token and revokes the whole grant via RFC 7009", async () => {
    const { app } = await setup();
    const { clientId } = await setupClient(app);
    const firstTokens = await exchangeAndRead(app, clientId);

    const refreshed = await app.request(`${ISSUER}/oauth/mcp/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: String(firstTokens.refresh_token),
        client_id: clientId,
      }).toString(),
    });
    expect(refreshed.status).toBe(200);
    const refreshedBody = await readJson(refreshed);
    expect(typeof refreshedBody.access_token).toBe("string");

    const revoke = await app.request(`${ISSUER}/oauth/mcp/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: String(refreshedBody.access_token), client_id: clientId }).toString(),
    });
    expect(revoke.status).toBe(200);

    const afterRevoke = await app.request(`${ISSUER}/oauth/mcp/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: String(firstTokens.refresh_token),
        client_id: clientId,
      }).toString(),
    });
    expect((await readJson(afterRevoke)).error).toBe("invalid_grant");

    const mcp = await app.request(`${ISSUER}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${String(refreshedBody.access_token)}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(mcp.status).toBe(401);
  });
});

describe("dynamic client registration", () => {
  it("registers a public client and rejects invalid metadata", async () => {
    const { app } = await setup();
    const response = await app.request(`${ISSUER}/oauth/mcp/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Dynamic", redirect_uris: ["http://127.0.0.1:1455/cb"] }),
    });
    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(typeof body.client_id).toBe("string");
    // RFC 7591: omitted token_endpoint_auth_method defaults to client_secret_basic.
    expect(body.token_endpoint_auth_method).toBe("client_secret_basic");

    const invalid = await app.request(`${ISSUER}/oauth/mcp/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Evil", redirect_uris: ["https://client.example/cb?steal=1"] }),
    });
    expect(invalid.status).toBe(400);
  });

  it("rate limits registration per IP with Retry-After", async () => {
    const { app } = await setup();
    let last: Response | undefined;
    for (let index = 0; index < 12; index += 1) {
      last = await app.request(`${ISSUER}/oauth/mcp/register`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
        body: JSON.stringify({ redirect_uris: ["https://client.example/cb"] }),
      });
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toBeTruthy();
  });
});

describe("auth modes", () => {
  it("mixed accepts runtime tokens, oauth-only rejects them", async () => {
    const mixed = await setup({ authMode: "mixed" });
    const token = await createRuntimeToken(mixed.database);
    const mixedResponse = await mixed.app.request(`${ISSUER}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(mixedResponse.status).not.toBe(401);

    const oauthOnly = await setup({ authMode: "oauth" });
    const oauthToken = await createRuntimeToken(oauthOnly.database);
    const oauthResponse = await oauthOnly.app.request(`${ISSUER}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${oauthToken}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(oauthResponse.status).toBe(401);
    expect(oauthResponse.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("runtime_token (default) rejects OAuth access tokens", async () => {
    const legacy = await setup({ authMode: "runtime_token" });
    const { app } = legacy;
    const { clientId } = await setupClient(app);
    const tokens = await exchangeAndRead(app, clientId);
    const response = await app.request(`${ISSUER}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${String(tokens.access_token)}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(401);
  });
});

describe("admin client management", () => {
  it("returns the secret exactly once and never on list", async () => {
    const { app } = await setup();
    const { clientSecret } = await createManualClient(app, "client_secret_basic");
    expect(typeof clientSecret).toBe("string");

    const list = await app.request(`${ISSUER}/api/oauth-clients`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const clients = (await readJson(list)) as unknown as Array<Record<string, unknown>>;
    expect(clients).toHaveLength(1);
    expect(clients[0]).not.toHaveProperty("clientSecret");
    expect(clients[0]?.hasSecret).toBe(true);

    const rotated = await app.request(`${ISSUER}/api/oauth-clients/${String(clients[0]?.clientId)}/rotate-secret`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(rotated.status).toBe(200);
    expect(typeof (await readJson(rotated)).clientSecret).toBe("string");
  });

  it("requires the admin token", async () => {
    const { app } = await setup();
    const response = await app.request(`${ISSUER}/api/oauth-clients`);
    expect(response.status).toBe(401);
  });

  it("deleting a client revokes its issued tokens", async () => {
    const { app } = await setup();
    const { clientId } = await setupClient(app);
    const tokens = await exchangeAndRead(app, clientId);

    const removed = await app.request(`${ISSUER}/api/oauth-clients/${clientId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(removed.status).toBe(200);

    const mcp = await app.request(`${ISSUER}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${String(tokens.access_token)}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(mcp.status).toBe(401);
  });

  it("deleting a client with an approved-but-unredeemed code kills its backing grant", async () => {
    const { app, database } = await setup();
    const clientId = (await setupClient(app)).clientId;
    const pair = pkcePair();
    const { location, verifier } = await authorizeAndApprove(app, clientId, undefined, undefined, pair);
    // Consent approval mints a backing runtime token; the code is unredeemed.
    expect((await database.runtimeTokenStore.list()).length).toBeGreaterThan(0);
    const backingTokenId = (await database.oauthCodeStore.listByClient(clientId))[0]?.runtimeTokenId;
    expect(backingTokenId).toBeTruthy();

    const removed = await app.request(`${ISSUER}/api/oauth-clients/${clientId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(removed.status).toBe(200);

    // Revocation deletes the row: the consent-minted backing token must be gone.
    expect(await database.runtimeTokenStore.findById(backingTokenId as string)).toBeUndefined();
    // Redeeming the pending code must fail even for a re-registered client id.
    const replay = await exchangeCode(app, clientId, location.searchParams.get("code") ?? "", verifier);
    expect(replay.status).toBe(401);
  });
});

async function setupClient(app: HonoApp): Promise<{ clientId: string }> {
  return { clientId: (await createManualClient(app)).clientId };
}

async function exchangeAndRead(app: HonoApp, clientId: string): Promise<Record<string, unknown>> {
  const { verifier } = pkcePair();
  const { location } = await authorizeAndApprove(app, clientId);
  const response = await exchangeCode(app, clientId, location.searchParams.get("code") ?? "", verifier);
  expect(response.status).toBe(200);
  return readJson(response);
}

async function createRuntimeToken(database: SqliteRuntimeDatabase): Promise<string> {
  const service = new RuntimeTokenService(database.runtimeTokenStore);
  const created = await service.createToken("test");
  return created.token;
}

describe("consent scope enforcement", () => {
  it("rejects a pending consent after the administrator removes offline access", async () => {
    const { app, database } = await setup();
    const { clientId } = await createManualClient(app);
    const page = await authorizeGetConsent(app, clientId);
    const handle = /name="handle" value="([^"]+)"/.exec(page)?.[1] ?? "";
    const updated = await app.request(`${ISSUER}/api/oauth-clients/${clientId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ scopes: ["mcp:access"] }),
    });
    expect(updated.status).toBe(200);
    const approved = await app.request(`${ISSUER}/oauth/mcp/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ISSUER },
      body: new URLSearchParams({ handle, decision: "approve", admin_token: ADMIN_TOKEN }),
    });
    expect(approved.status).toBe(302);
    const redirect = new URL(approved.headers.get("location") ?? "");
    expect(redirect.searchParams.get("error")).toBe("invalid_scope");
    expect(redirect.searchParams.has("code")).toBe(false);
    expect(await database.oauthCodeStore.listByClient(clientId)).toEqual([]);
    expect(await database.runtimeTokenStore.list()).toEqual([]);

    const { location, verifier } = await authorizeAndApprove(app, clientId, "mcp:access");
    const tokenResponse = await exchangeCode(app, clientId, location.searchParams.get("code") ?? "", verifier);
    expect(tokenResponse.status).toBe(200);
    const tokens = await readJson(tokenResponse);
    expect(tokens.scope).toBe("mcp:access");
    expect(tokens).not.toHaveProperty("refresh_token");
  });
});

describe("oauth client scope defaults", () => {
  it("registers a DCR client without scope with all supported scopes and authorizes offline access", async () => {
    const { app } = await setup();
    const registered = await app.request(`${ISSUER}/oauth/mcp/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "ChatGPT",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
      }),
    });
    expect(registered.status).toBe(201);
    const registration = await readJson(registered);
    expect(registration.scopes).toEqual(["mcp:access", "offline_access"]);

    const clientId = String(registration.client_id);
    const { location, verifier } = await authorizeAndApprove(app, clientId);
    const code = location.searchParams.get("code") ?? "";
    const tokenResponse = await exchangeCode(app, clientId, code, verifier);
    expect(tokenResponse.status).toBe(200);
    const tokens = await readJson(tokenResponse);
    expect(tokens.scope).toBe("mcp:access offline_access");
    expect(typeof tokens.refresh_token).toBe("string");
  });

  it("registers an explicit scope subset restricted to that subset", async () => {
    const { app } = await setup();
    const registered = await app.request(`${ISSUER}/oauth/mcp/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Restricted client",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
        scope: "mcp:access",
      }),
    });
    expect(registered.status).toBe(201);
    const registration = await readJson(registered);
    expect(registration.scopes).toEqual(["mcp:access"]);

    const { challenge } = pkcePair();
    const authorizeUrl = new URL(`${ISSUER}/oauth/mcp/authorize`);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(registration.client_id));
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT);
    authorizeUrl.searchParams.set("scope", "mcp:access offline_access");
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    const response = await app.request(authorizeUrl, { redirect: "manual" });
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("location") ?? "");
    expect(redirect.searchParams.get("error")).toBe("invalid_scope");
  });
});
