import type { IOAuthSigningKeyStore } from "../storage/oauth-as-stores.ts";
import type { TokenDependencies } from "./token-endpoint.ts";
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
import { resolveOAuthServerConfig } from "./config.ts";
import { hashToken } from "./jwks.ts";
import { authenticateClient, handleRevokePost, handleTokenPost, TokenError } from "./token-endpoint.ts";

// Token-endpoint behavior: HTTP Basic client authentication (RFC 6749
// section 2.3.1), single-use refresh-token rotation, and refresh tokens only
// for `offline_access`. The Hono app provides the authorize flow; the token
// handlers are invoked directly so the Authorization header can be passed
// exactly as the routes layer will.
const ISSUER = "https://connect.example";
const REDIRECT = "http://127.0.0.1:9375/callback";
const ADMIN_TOKEN = "admin-secret";

async function setup(): Promise<{ app: Hono; database: SqliteRuntimeDatabase; deps: TokenDependencies }> {
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
      rootDir: ".tmp/oauth-token-endpoint-tests",
      publicOrigin: ISSUER,
      ttlSeconds: 60,
      maxBytes: 1024 * 1024,
    }),
  });
  const deps: TokenDependencies = {
    config: resolveOAuthServerConfig({ issuer: ISSUER }),
    clients: database.oauthClientStore,
    codes: database.oauthCodeStore,
    tokens: database.oauthTokenStore,
    keys: database.oauthSigningKeyStore,
    runtimeTokens: new RuntimeTokenService(database.runtimeTokenStore),
    runtimeTokenStore: database.runtimeTokenStore,
  };
  return { app, database, deps };
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = "test-verifier-with-at-least-43-characters-for-pkce-s256-aaaaaaaaaaaa";
  return { verifier, challenge: createHash("sha256").update(verifier, "ascii").digest("base64url") };
}

function basicHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

interface HonoApp {
  request(input: string | URL | Request, init?: RequestInit): Promise<Response> | Response;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
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
      redirectUris: [REDIRECT],
      tokenEndpointAuthMethod,
      scopes: ["mcp:access", "offline_access"],
    }),
  });
  expect(response.status).toBe(201);
  const body = await readJson(response);
  const client = body.client as { clientId: string };
  return { clientId: client.clientId, clientSecret: body.clientSecret as string | undefined };
}

async function authorizeAndApprove(app: HonoApp, clientId: string, scope = "mcp:access offline_access"): Promise<URL> {
  const { challenge } = pkcePair();
  const authorizeUrl = new URL(`${ISSUER}/oauth/mcp/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
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
  return new URL(approved.headers.get("location") ?? "");
}

async function exchangeCode(
  app: HonoApp,
  clientId: string,
  code: string,
  verifier: string,
): Promise<Record<string, unknown>> {
  const response = await app.request(`${ISSUER}/oauth/mcp/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  });
  expect(response.status).toBe(200);
  return readJson(response);
}

async function refreshViaApp(app: HonoApp, clientId: string, refreshToken: string): Promise<Response> {
  return app.request(`${ISSUER}/oauth/mcp/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
  });
}

describe("client_secret_basic authentication", () => {
  it("authenticates from the Authorization header", async () => {
    const { app, deps } = await setup();
    const { clientId, clientSecret } = await createManualClient(app, "client_secret_basic");
    expect(typeof clientSecret).toBe("string");

    const client = await authenticateClient(new URLSearchParams(), deps, basicHeader(clientId, clientSecret ?? ""));
    expect(client.clientId).toBe(clientId);
  });

  it("form-URL-decodes the id and secret per RFC 6749 section 2.3.1", async () => {
    const { deps } = await setup();
    const secret = "p%40ss word+and=more";
    await deps.clients.add({
      clientId: "encoded-client",
      clientName: "Encoded",
      registrationType: "manual",
      redirectUris: [REDIRECT],
      scopes: ["mcp:access", "offline_access"],
      tokenEndpointAuthMethod: "client_secret_basic",
      clientSecretHash: hashToken(secret),
      createdAt: new Date().toISOString(),
    });

    const encoded = `Basic ${Buffer.from(`encoded-client:${encodeURIComponent(secret)}`).toString("base64")}`;
    const client = await authenticateClient(new URLSearchParams(), deps, encoded);
    expect(client.clientId).toBe("encoded-client");

    // The raw secret sent without form-encoding must not authenticate: the
    // decoding step changes it ("+" becomes a space, %40 becomes @).
    const raw = `Basic ${Buffer.from(`encoded-client:${secret}`).toString("base64")}`;
    await expect(authenticateClient(new URLSearchParams(), deps, raw)).rejects.toMatchObject({
      code: "invalid_client",
    });
  });

  it("rejects malformed Basic headers", async () => {
    const { app, deps } = await setup();
    const { clientId, clientSecret } = await createManualClient(app, "client_secret_basic");

    // No colon separator.
    const noColon = `Basic ${Buffer.from(clientId).toString("base64")}`;
    await expect(authenticateClient(new URLSearchParams(), deps, noColon)).rejects.toMatchObject({
      code: "invalid_client",
    });
    // Payload that is not valid base64.
    await expect(authenticateClient(new URLSearchParams(), deps, "Basic !!!not-base64!!!")).rejects.toMatchObject({
      code: "invalid_client",
    });
    // Empty payload.
    await expect(authenticateClient(new URLSearchParams(), deps, "Basic ")).rejects.toMatchObject({
      code: "invalid_client",
    });
    // A well-formed header with the wrong secret.
    await expect(
      authenticateClient(new URLSearchParams(), deps, basicHeader(clientId, `${clientSecret ?? ""}-wrong`)),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });

  it("ignores non-Basic authorization headers and falls back to the form fields", async () => {
    const { app, deps } = await setup();
    const { clientId, clientSecret } = await createManualClient(app, "client_secret_basic");
    const form = new URLSearchParams({ client_id: clientId, client_secret: clientSecret ?? "" });
    const client = await authenticateClient(form, deps, "Bearer some-other-scheme");
    expect(client.clientId).toBe(clientId);
  });

  it("exchanges an authorization code end-to-end with client_secret_basic", async () => {
    const { app, deps } = await setup();
    const { clientId, clientSecret } = await createManualClient(app, "client_secret_basic");
    const { verifier } = pkcePair();
    const location = await authorizeAndApprove(app, clientId);
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: location.searchParams.get("code") ?? "",
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    });

    const tokens = await handleTokenPost(form, deps, basicHeader(clientId, clientSecret ?? ""));
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.scope).toBe("mcp:access offline_access");
    expect(typeof tokens.access_token).toBe("string");
    expect(typeof tokens.refresh_token).toBe("string");

    // A wrong secret is rejected before the grant is even looked at.
    await expect(handleTokenPost(form, deps, basicHeader(clientId, "wrong-secret"))).rejects.toMatchObject({
      code: "invalid_client",
    });
  });

  it("revokes via the revocation handler with client_secret_basic", async () => {
    const { app, deps } = await setup();
    const { clientId, clientSecret } = await createManualClient(app, "client_secret_basic");
    const { verifier } = pkcePair();
    const location = await authorizeAndApprove(app, clientId);
    const first = await handleTokenPost(
      new URLSearchParams({
        grant_type: "authorization_code",
        code: location.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT,
        code_verifier: verifier,
      }),
      deps,
      basicHeader(clientId, clientSecret ?? ""),
    );

    await handleRevokePost(
      new URLSearchParams({ token: first.access_token }),
      deps,
      basicHeader(clientId, clientSecret ?? ""),
    );

    // RFC 7009 revocation of the access token kills the whole grant, so the
    // refresh token issued alongside it no longer redeems.
    await expect(
      handleTokenPost(
        new URLSearchParams({ grant_type: "refresh_token", refresh_token: first.refresh_token ?? "" }),
        deps,
      ),
    ).rejects.toBeInstanceOf(TokenError);
  });
});

describe("refresh token rotation", () => {
  it("makes the previous refresh token single-use and issues a working new one", async () => {
    const { app } = await setup();
    const { clientId } = await createManualClient(app);
    const { verifier } = pkcePair();
    const location = await authorizeAndApprove(app, clientId);
    const first = await exchangeCode(app, clientId, location.searchParams.get("code") ?? "", verifier);
    expect(typeof first.refresh_token).toBe("string");

    const refreshedResponse = await refreshViaApp(app, clientId, String(first.refresh_token));
    expect(refreshedResponse.status).toBe(200);
    const refreshed = await readJson(refreshedResponse);
    expect(typeof refreshed.access_token).toBe("string");
    expect(refreshed.refresh_token).not.toBe(first.refresh_token);

    // Replay of the consumed token: invalid_grant, even for the known client.
    const replay = await refreshViaApp(app, clientId, String(first.refresh_token));
    expect(replay.status).toBe(400);
    expect((await readJson(replay)).error).toBe("invalid_grant");

    // The rotation successor still redeems.
    const secondResponse = await refreshViaApp(app, clientId, String(refreshed.refresh_token));
    expect(secondResponse.status).toBe(200);
  });

  it("accepts a scope subset on refresh and rejects exceeding the granted scope", async () => {
    const { app, deps } = await setup();
    const { clientId } = await createManualClient(app);
    const { verifier } = pkcePair();
    const location = await authorizeAndApprove(app, clientId);
    const first = await handleTokenPost(
      new URLSearchParams({
        grant_type: "authorization_code",
        code: location.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier,
      }),
      deps,
    );

    // A subset of the granted scope is accepted; the token is reissued with
    // the originally granted scope.
    const narrowed = await handleTokenPost(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: String(first.refresh_token ?? ""),
        client_id: clientId,
        scope: "mcp:access",
      }),
      deps,
    );
    expect(narrowed.scope).toBe("mcp:access offline_access");
    expect(typeof narrowed.refresh_token).toBe("string");

    // Requesting more than the originally granted scope is refused.
    await expect(
      handleTokenPost(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: narrowed.refresh_token ?? "gone",
          client_id: clientId,
          scope: "mcp:access offline_access extra:scope",
        }),
        deps,
      ),
    ).rejects.toMatchObject({ code: "invalid_scope" });

    // The rejected request did not consume the token: it still redeems.
    const stillRedeemable = await refreshViaApp(app, clientId, String(narrowed.refresh_token ?? ""));
    expect(stillRedeemable.status).toBe(200);
  });
});

describe("refresh token rotation atomicity", () => {
  it("leaves the old refresh token redeemable when signing fails before rotation", async () => {
    const { app, deps } = await setup();
    const { clientId } = await createManualClient(app);
    const { verifier } = pkcePair();
    const location = await authorizeAndApprove(app, clientId);
    const first = await exchangeCode(app, clientId, location.searchParams.get("code") ?? "", verifier);

    const failingKeys = Object.create(deps.keys) as IOAuthSigningKeyStore;
    failingKeys.active = () => Promise.reject(new Error("key activation failed"));
    await expect(
      handleTokenPost(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: String(first.refresh_token ?? ""),
          client_id: clientId,
        }),
        { ...deps, keys: failingKeys },
      ),
    ).rejects.toMatchObject({ message: "key activation failed" });

    // The old token was not consumed by the failed attempt: it still redeems.
    const retry = await refreshViaApp(app, clientId, String(first.refresh_token));
    expect(retry.status).toBe(200);
  });

  it("lets only one of two concurrent redemptions rotate the token", async () => {
    const { app, deps } = await setup();
    const { clientId } = await createManualClient(app);
    const { verifier } = pkcePair();
    const location = await authorizeAndApprove(app, clientId);
    const first = await exchangeCode(app, clientId, location.searchParams.get("code") ?? "", verifier);

    const form = () =>
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: String(first.refresh_token),
        client_id: clientId,
      });
    const [firstAttempt, secondAttempt] = await Promise.allSettled([
      handleTokenPost(form(), deps),
      handleTokenPost(form(), deps),
    ]);

    const settled = [firstAttempt, secondAttempt];
    const fulfilled = settled.filter((attempt) => attempt.status === "fulfilled");
    const rejected = settled.filter((attempt) => attempt.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: expect.objectContaining({ code: "invalid_grant" }) });

    // Exactly one successor was inserted: the original record plus one.
    const records = await deps.tokens.listByClient(clientId);
    expect(records).toHaveLength(2);

    // The single successor still redeems.
    const successor = fulfilled[0] as PromiseFulfilledResult<{ refresh_token?: string }>;
    const next = await refreshViaApp(app, clientId, String(successor.value.refresh_token));
    expect(next.status).toBe(200);
  });

  it("rejects an excess scope before consuming the refresh token", async () => {
    const { app, deps } = await setup();
    const { clientId } = await createManualClient(app);
    const { verifier } = pkcePair();
    const location = await authorizeAndApprove(app, clientId);
    const first = await exchangeCode(app, clientId, location.searchParams.get("code") ?? "", verifier);

    await expect(
      handleTokenPost(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: String(first.refresh_token ?? ""),
          client_id: clientId,
          scope: "mcp:access offline_access extra:scope",
        }),
        deps,
      ),
    ).rejects.toMatchObject({ code: "invalid_scope" });

    // The rejected request did not consume the token: it still redeems.
    const retry = await refreshViaApp(app, clientId, String(first.refresh_token));
    expect(retry.status).toBe(200);
  });
});

describe("offline_access gating", () => {
  it("issues no refresh token when offline_access was not granted", async () => {
    const { app, deps } = await setup();
    const { clientId } = await createManualClient(app);
    const { verifier } = pkcePair();
    const location = await authorizeAndApprove(app, clientId, "mcp:access");
    const tokens = await handleTokenPost(
      new URLSearchParams({
        grant_type: "authorization_code",
        code: location.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier,
      }),
      deps,
    );
    expect(tokens.scope).toBe("mcp:access");
    expect(tokens.refresh_token).toBeUndefined();

    // And there is nothing to refresh.
    await expect(
      handleTokenPost(
        new URLSearchParams({ grant_type: "refresh_token", refresh_token: "anything", client_id: clientId }),
        deps,
      ),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });
});
