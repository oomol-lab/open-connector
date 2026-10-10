import type { ProviderHttpAttempt } from "../core/provider-http-dispatch.ts";
import type { ConnectorRuntime, ConnectorRuntimeOptions } from "./connector-runtime.ts";

import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectorRuntime } from "./connector-runtime.ts";
import { AesGcmSecretCodec } from "./secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "./storage/sqlite/runtime-store.ts";

let runtime: ConnectorRuntime | undefined;
const directories: string[] = [];
const publicOrigin = "https://host.example/connector";

afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("headless runtime", () => {
  it.each([45, undefined])(
    "preserves console and runtime denial formats with retry delay %s",
    async (retryAfterSeconds) => {
      const fetcher = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetcher);
      runtime = await createConnectorRuntime({
        ...(await fixture()),
        providerHttpDispatch: { beforeAttempt: () => ({ allow: false, retryAfterSeconds }) },
      });
      const consoleResponse = await request(
        "/api/connections/github",
        { authType: "api_key", values: { apiKey: "fixture-secret" } },
        "admin-token",
        "PUT",
      );
      const runtimeResponse = await request("/v1/connections/github/connect/api-key", { apiKey: "fixture-secret" });
      for (const response of [consoleResponse, runtimeResponse]) {
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe(
          retryAfterSeconds === undefined ? null : String(retryAfterSeconds),
        );
      }
      expect(await consoleResponse.json()).toEqual({
        error: { code: "rate_limited", message: "Provider HTTP dispatch is temporarily unavailable." },
      });
      expect(await runtimeResponse.json()).toMatchObject({
        success: false,
        errorCode: "rate_limited",
        message: "Provider HTTP dispatch is temporarily unavailable.",
      });
      expect(fetcher).not.toHaveBeenCalled();
      expect((await (await request("/v1/connections")).json()).data).toEqual([]);
    },
  );

  it.each([
    ["oauth", "https://host.example/settings/connections"],
    ["credential_validation", "https://host.example/settings/connections"],
    ["oauth", undefined],
    ["credential_validation", undefined],
  ])("completes a denied %s connection request with return URI %s", async (operation, returnUri) => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ access_token: "fixture-access-token", token_type: "bearer", scope: "read:user" }),
    );
    vi.stubGlobal("fetch", fetcher);
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      providerHttpDispatch: {
        beforeAttempt: (attempt) =>
          attempt.context.operation === operation ? { allow: false, retryAfterSeconds: 45 } : { allow: true },
      },
    });
    expect(
      (
        await request(
          "/api/oauth/configs/github",
          { clientId: "fixture-client", clientSecret: "fixture-secret" },
          "admin-token",
          "PUT",
        )
      ).status,
    ).toBe(200);
    const started = await request("/v1/connections/github/connect", { returnUri });
    expect(started.status).toBe(200);
    const attempt = (await started.json()).data;
    const state = new URL(attempt.authorizationUrl).searchParams.get("state")!;
    const path = `/oauth/callback?state=${encodeURIComponent(state)}&code=fixture-code`;
    const callback = await request(path);
    if (returnUri) {
      expect(callback.status).toBe(302);
      const returned = new URL(callback.headers.get("location")!);
      expect(`${returned.origin}${returned.pathname}`).toBe(returnUri);
      expect(Object.fromEntries(returned.searchParams)).toEqual({
        status: "error",
        service: "github",
        code: "rate_limited",
        message: "Provider HTTP dispatch is temporarily unavailable.",
      });
    } else {
      expect(callback.status).toBe(400);
      expect(await callback.json()).toEqual({
        error: { code: "rate_limited", message: "Provider HTTP dispatch is temporarily unavailable." },
      });
    }
    expect(callback.headers.get("Retry-After")).toBeNull();
    const completed = await request(`/v1/connection-requests/${attempt.connectionRequestId}`);
    expect((await completed.json()).data).toMatchObject({ status: "failed", errorCode: "rate_limited" });
    expect((await (await request("/v1/connections")).json()).data).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(operation === "oauth" ? 0 : 1);
    const replay = await request(path);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: { code: "invalid_oauth_state" } });
  });

  it("preserves dispatch denial for OAuth authorizations without a connection request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      providerHttpDispatch: { beforeAttempt: () => ({ allow: false, retryAfterSeconds: 45 }) },
    });
    await request(
      "/api/oauth/configs/github",
      { clientId: "fixture-client", clientSecret: "fixture-secret" },
      "admin-token",
      "PUT",
    );
    const started = await request("/api/oauth/authorizations", { service: "github" });
    expect(started.status).toBe(200);
    const { state } = await started.json();
    const callback = await request(`/oauth/callback?state=${encodeURIComponent(state)}&code=fixture-code`);
    expect(callback.status).toBe(429);
    expect(callback.headers.get("Retry-After")).toBe("45");
    expect(await callback.json()).toEqual({
      error: { code: "rate_limited", message: "Provider HTTP dispatch is temporarily unavailable." },
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await (await request("/v1/connections")).json()).data).toEqual([]);
  });

  it("preserves admission denial after a real provider remaps it into validation and transport errors", async () => {
    let deny = false;
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ credit_balance: 100 }));
    vi.stubGlobal("fetch", fetcher);
    runtime = await createConnectorRuntime({
      ...(await fixture(["ninjapear"])),
      providerHttpDispatch: {
        beforeAttempt: () => (deny ? { allow: false, retryAfterSeconds: 62 } : { allow: true }),
      },
    });
    expect((await request("/v1/connections/ninjapear/connect/api-key", { apiKey: "fixture-secret" })).status).toBe(200);
    const accounts = (await (await request("/v1/apps", undefined, "runtime-token")).json()).data;
    deny = true;
    const executed = await runtime.fetch(
      new Request(`${publicOrigin}/v1/actions/ninjapear.get_credit_balance`, {
        method: "POST",
        headers: {
          authorization: "Bearer runtime-token",
          "content-type": "application/json",
          "x-oo-connector-alias": accounts[0].alias,
        },
        body: JSON.stringify({ input: {} }),
      }),
    );
    const validated = await request("/v1/connections/ninjapear/connect/api-key", { apiKey: "another-secret" });
    for (const response of [executed, validated]) {
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("62");
      expect(await response.json()).toMatchObject({ errorCode: "rate_limited" });
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("binds resolved connection authority and exposes dispatch denial as 429 on action, proxy and validation routes", async () => {
    const attempts: ProviderHttpAttempt[] = [];
    let deny = false;
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: 1, login: "fixture-account" }));
    vi.stubGlobal("fetch", fetcher);
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      providerHttpDispatch: {
        bindAuthority: (context) => ({ workspaceId: "host-workspace", connectionLineageId: context.connectionId }),
        beforeAttempt: (attempt) => {
          attempts.push(attempt);
          return deny ? { allow: false, retryAfterSeconds: 45 } : { allow: true };
        },
      },
    });
    const saved = await request("/v1/connections/github/connect/api-key", { apiKey: "fixture-secret" });
    expect(saved.status).toBe(200);
    const connection = (await saved.json()).data;
    expect(attempts[0]?.context).toMatchObject({ operation: "credential_validation", service: "github" });
    const accounts = (await (await request("/v1/apps", undefined, "runtime-token")).json()).data;
    deny = true;
    for (const [route, body] of [
      ["/v1/actions/github.get_current_user", { input: {}, connectionId: "untrusted" }],
      ["/v1/proxy/github", { method: "GET", endpoint: "/user", connectionId: "untrusted" }],
    ] as const) {
      const response = await runtime.fetch(
        new Request(`${publicOrigin}${route}`, {
          method: "POST",
          headers: {
            authorization: "Bearer runtime-token",
            "content-type": "application/json",
            "x-oo-connector-alias": accounts[0].alias,
          },
          body: JSON.stringify(body),
        }),
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("45");
      expect(await response.json()).toMatchObject({ errorCode: "rate_limited" });
      expect(attempts.at(-1)?.context.connectionId).toBe(connection.id);
      expect(attempts.at(-1)?.context.connectionName).toBe(accounts[0].alias);
      expect(attempts.at(-1)?.authority).toMatchObject({
        workspaceId: "host-workspace",
        connectionLineageId: connection.id,
      });
    }
    const refused = await request("/v1/connections/github/connect/api-key", {
      apiKey: "another-secret",
    });
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("45");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.stringify(attempts)).not.toMatch(/fixture-secret|another-secret|untrusted/);
  });
  it("serves the existing connection and action contracts under a host mount without a dashboard", async () => {
    const options = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: 1, login: "fixture-account", name: "Fixture Account" })),
    );
    runtime = await createConnectorRuntime(options);
    expect((await request("/v1/health", undefined, "runtime-token")).status).toBe(200);
    expect((await request("/")).status).toBe(404);
    expect((await request("/docs")).status).toBe(404);
    const missing = await request("/api/nope");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
    expect((await runtime.fetch(new Request("https://host.example/unrelated"))).status).toBe(404);
    expect((await request("/v1/connections", undefined, "runtime-token")).status).toBe(401);

    const saved = await request("/v1/connections/github/connect/api-key", { apiKey: "fixture-provider-secret" });
    expect(saved.status).toBe(200);
    const connection = (await saved.json()).data;
    expect(JSON.stringify(connection)).not.toContain("fixture-provider-secret");
    const accounts = await (await request("/v1/apps", undefined, "runtime-token")).json();
    const alias = accounts.data[0].alias;
    const executed = await runtime.fetch(
      new Request(`${publicOrigin}/v1/actions/github.get_current_user`, {
        method: "POST",
        headers: {
          authorization: "Bearer runtime-token",
          "content-type": "application/json",
          "x-oo-connector-alias": alias,
        },
        body: JSON.stringify({ input: {} }),
      }),
    );
    expect(executed.status).toBe(200);
    expect((await executed.json()).data).toMatchObject({ login: "fixture-account" });
    await runtime.close();
    expect(
      (await readFile(join(options.dataDir, "connect.sqlite"))).includes(Buffer.from("fixture-provider-secret")),
    ).toBe(false);

    runtime = await createConnectorRuntime({ ...options, apiReference: true });
    expect((await (await request("/v1/connections")).json()).data[0].id).toBe(connection.id);
    const docs = await request("/docs");
    expect(docs.status).toBe(200);
    const reference = await docs.text();
    expect(reference).toContain("/connector/openapi.json");
    expect(reference).not.toContain(`${publicOrigin}/openapi.json`);
  });

  it("derives the provider callback from the host URL and honors the host return URI", async () => {
    runtime = await createConnectorRuntime(await fixture());
    const setupResponse = await request("/v1/providers/github/setup");
    expect(setupResponse.headers.get("cache-control")).toBe("no-store");
    const setup = (await setupResponse.json()).data;
    expect(setup.oauthClient).toMatchObject({
      configured: false,
      expectedRedirectUri: `${publicOrigin}/oauth/callback`,
      missingFields: ["clientId", "clientSecret"],
    });
    const dashboard = await (await request("/api/providers")).json();
    expect(dashboard[0].setup).toEqual(setup.auth);
    expect(JSON.stringify(setup)).not.toMatch(/authorizationUrl|tokenUrl|tokenEndpointAuthMethod/);
    expect((await request("/v1/providers/github/setup", undefined, "runtime-token")).status).toBe(401);
    expect((await request("/v1/providers/missing/setup")).status).toBe(404);
    const configured = await request(
      "/api/oauth/configs/github",
      { clientId: "fixture-client", clientSecret: "fixture-secret" },
      "admin-token",
      "PUT",
    );
    expect(configured.status).toBe(200);
    expect((await configured.json()).expectedRedirectUri).toBe(`${publicOrigin}/oauth/callback`);
    const savedSetup = await (await request("/v1/providers/github/setup")).json();
    expect(savedSetup.data.oauthClient).toMatchObject({ configured: true, missingFields: [] });
    expect(JSON.stringify(savedSetup)).not.toMatch(/fixture-client|fixture-secret/);
    const started = await request("/v1/connections/github/connect", {
      returnUri: "https://host.example/settings/connections",
    });
    expect(started.status).toBe(200);
    const attempt = (await started.json()).data;
    const authorization = new URL(attempt.authorizationUrl);
    expect(authorization.searchParams.get("redirect_uri")).toBe(`${publicOrigin}/oauth/callback`);
    const callback = await request(
      `/oauth/callback?state=${encodeURIComponent(authorization.searchParams.get("state")!)}&error=access_denied`,
    );
    expect(callback.status).toBe(302);
    const returned = new URL(callback.headers.get("location")!);
    expect(`${returned.origin}${returned.pathname}`).toBe("https://host.example/settings/connections");
    expect((await (await request(`/v1/connection-requests/${attempt.connectionRequestId}`)).json()).data.status).toBe(
      "failed",
    );
  });

  it("carries a configured redirect URI override through setup, the authorize URL and the code exchange", async () => {
    runtime = await createConnectorRuntime(await fixture());
    expect((await (await request("/v1/providers/github/setup")).json()).data.oauthClient).toMatchObject({
      expectedRedirectUri: `${publicOrigin}/oauth/callback`,
    });
    const refused = await request(
      "/api/oauth/configs/github",
      { clientId: "fixture-client", clientSecret: "fixture-secret", redirectUri: "oauth/callback" },
      "admin-token",
      "PUT",
    );
    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toMatchObject({ error: { code: "invalid_input" } });
    const configured = await request(
      "/api/oauth/configs/github",
      { clientId: "fixture-client", clientSecret: "fixture-secret", redirectUri: "app://oauth/callback" },
      "admin-token",
      "PUT",
    );
    expect(configured.status).toBe(200);
    const setup = (await (await request("/v1/providers/github/setup")).json()).data;
    // The setup block reports only the effective redirect; the override itself stays on the admin config API.
    expect(setup.oauthClient).toEqual({
      configured: true,
      customClientAvailable: false,
      expectedRedirectUri: "app://oauth/callback",
      missingFields: [],
    });
    expect(JSON.stringify(setup)).not.toMatch(/fixture-client|fixture-secret/);

    const started = await request("/v1/connections/github/connect", {
      returnUri: "https://host.example/settings/connections",
    });
    expect(started.status).toBe(200);
    const attempt = (await started.json()).data;
    const authorization = new URL(attempt.authorizationUrl);
    expect(authorization.searchParams.get("redirect_uri")).toBe("app://oauth/callback");

    // The callback route is unchanged: the app that owns the scheme forwards the
    // provider's query here, and the exchange repeats the registered redirect.
    const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      String(url).includes("/login/oauth/access_token")
        ? Response.json({ access_token: "fixture-access-token", token_type: "bearer", scope: "read:user" })
        : Response.json({ id: 1, login: "fixture-account", name: "Fixture Account" }),
    );
    vi.stubGlobal("fetch", fetcher);
    const callback = await request(
      `/oauth/callback?state=${encodeURIComponent(authorization.searchParams.get("state")!)}&code=fixture-code`,
    );
    expect(callback.status).toBe(302);
    expect(new URL(callback.headers.get("location")!).searchParams.get("status")).toBe("success");
    const exchange = fetcher.mock.calls.find(([url]) => String(url).includes("/login/oauth/access_token"));
    expect(new URLSearchParams(String(exchange?.[1]?.body)).get("redirect_uri")).toBe("app://oauth/callback");
    expect((await (await request(`/v1/connection-requests/${attempt.connectionRequestId}`)).json()).data.status).toBe(
      "connected",
    );
  });

  it("aborts active provider calls before closing storage and rejects requests after close", async () => {
    runtime = await createConnectorRuntime(await fixture());
    vi.stubGlobal("fetch", async () => Response.json({ id: 1, login: "fixture-account" }));
    expect((await request("/v1/connections/github/connect/api-key", { apiKey: "fixture-secret" })).status).toBe(200);
    let started!: () => void;
    const ready = new Promise<void>((done) => {
      started = done;
    });
    let aborted = false;
    vi.stubGlobal(
      "fetch",
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_done, fail) => {
          new Request(input, init).signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              fail(new DOMException("Cancelled", "AbortError"));
            },
            { once: true },
          );
          started();
        }),
    );
    const accounts = (await (await request("/v1/apps", undefined, "runtime-token")).json()).data;
    const running = runtime.fetch(
      new Request(`${publicOrigin}/v1/proxy/github`, {
        method: "POST",
        headers: {
          authorization: "Bearer runtime-token",
          "content-type": "application/json",
          "x-oo-connector-alias": accounts[0].alias,
        },
        body: JSON.stringify({ method: "GET", endpoint: "/user" }),
      }),
    );
    await Promise.race([
      ready,
      running.then(async (response) => {
        throw new Error(await response.text());
      }),
    ]);
    const firstClose = runtime.close();
    expect(runtime.close()).toBe(firstClose);
    await firstClose;
    expect(aborted).toBe(true);
    expect((await running).ok).toBe(false);
    expect((await request("/v1/health", undefined, "runtime-token")).status).toBe(503);
  });

  it("allows one active runtime and releases the slot on initialization failure or close", async () => {
    const options = await fixture();
    await expect(createConnectorRuntime({ ...options, publicOrigin: "file:///bad" })).rejects.toThrow("publicOrigin");
    await expect(createConnectorRuntime({ ...options, transitFiles: { maxBytes: 0 } })).rejects.toThrow("maxBytes");
    runtime = await createConnectorRuntime(options);
    await expect(createConnectorRuntime(options)).rejects.toThrow("Only one");
    await runtime.close();
    runtime = await createConnectorRuntime(options);
    expect((await request("/v1/health", undefined, "runtime-token")).status).toBe(200);
  });
});

it("starts persisted cleanup without HTTP traffic and waits for its abort on close", async () => {
  const options = await fixture();
  await mkdir(options.dataDir, { recursive: true });
  const codec = new AesGcmSecretCodec(options.encryptionKey!);
  let database = new SqliteRuntimeDatabase(join(options.dataDir, "connect.sqlite"), { secretCodec: codec });
  await database.saasProjectStore.saveProject({
    id: "managed",
    projectId: "project",
    baseUrl: "https://saas.example",
    apiKey: "project-key",
  });
  const lease = await database.connectionRequestStore.createSaas({
    connectionRequestId: crypto.randomUUID(),
    connectionId: crypto.randomUUID(),
    connectionName: "cleanup",
    owner: "admin",
    service: "github",
    managedProjectId: "managed",
    providerConfigId: "config",
    externalUserId: "user",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  await database.connectionRequestStore.saveSaasRequest(lease, "remote");
  await database.connectionRequestStore.saveSaasCandidate(lease, {
    connectedAccountId: "account",
    status: "active",
    comment: null,
    profile: { accountId: "user", displayName: "User", grantedScopes: [] },
  });
  await database.connectionRequestStore.cancelSaas(lease.pending.connectionRequestId, "admin");
  database.close();
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetcher);
  runtime = await createConnectorRuntime(options);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0][1]?.method).toBe("DELETE");
  await runtime.close();
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  database = new SqliteRuntimeDatabase(join(options.dataDir, "connect.sqlite"), { secretCodec: codec });
  try {
    expect((await database.saasProjectStore.getCleanupStats()).pending).toBe(1);
  } finally {
    database.close();
  }
});

describe("externally managed credentials", () => {
  const externalCredential = {
    authType: "oauth2",
    accessToken: "external-access-token",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    refreshToken: "external-refresh-token",
    profile: { accountId: "external-account", displayName: "External Account", grantedScopes: ["read:user"] },
    metadata: { oauthClientConfig: { clientId: "github-client-id" } },
  };

  /** GitHub's user endpoint answers with the bearer it was shown; its token endpoint refreshes. */
  function stubGitHub(): { bodies: Record<string, string> } {
    const bodies: Record<string, string> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
        bodies[url] = input instanceof Request ? await input.clone().text() : String(init?.body ?? "");
        if (url.startsWith("https://api.github.com/user")) {
          // Name the token's owner without echoing the token into the action output.
          const bearer = headers.get("authorization")?.split(" ")[1];
          const login = bearer === "external-access-token" ? "external-user" : "another-user";
          return Response.json({ id: 1, login, name: "Fixture Account" });
        }
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({
            access_token: "refreshed-access-token",
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "refreshed-refresh-token",
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    return { bodies };
  }

  it("refuses a credential in the request unless the runtime was created for it", async () => {
    runtime = await createConnectorRuntime(await fixture());
    const health = await (await request("/v1/health", undefined, "runtime-token")).json();
    expect(health.data.capabilities).toEqual([]);
    const refused = await runAction({ input: {}, credential: externalCredential });
    expect(refused.status).toBe(400);
    expect((await refused.json()).errorCode).toBe("external_credentials_disabled");
    const refresh = await request(
      "/v1/credentials/refresh",
      { service: "github", credential: externalCredential },
      "runtime-token",
    );
    expect(refresh.status).toBe(404);
    expect((await request("/v1/connections/by-id/some-id/export")).status).toBe(404);
  });

  it("executes with the credential it was handed, stores nothing, and refreshes it on request", async () => {
    const options = await fixture();
    const { bodies } = stubGitHub();
    runtime = await createConnectorRuntime({ ...options, externalCredentials: true, credentialExport: true });
    const health = await (await request("/v1/health", undefined, "runtime-token")).json();
    expect(health.data.capabilities).toEqual(["external_credential", "credential_export"]);

    const executed = await runAction({ input: {}, credential: externalCredential });
    expect(executed.status).toBe(200);
    expect((await executed.json()).data).toMatchObject({ login: "external-user" });
    expect((await (await request("/v1/connections")).json()).data).toEqual([]);
    const runs = JSON.stringify(await (await request("/api/runs")).json());
    expect(runs).toContain('"connectionId":"external"');
    expect(runs).toContain('"accountId":"external-account"');
    expect(runs).not.toContain("external-access-token");

    // A credential beside a named connection is refused rather than guessed at.
    const both = await runAction({ input: {}, credential: externalCredential, alias: "work" });
    expect(both.status).toBe(400);
    expect((await both.json()).errorCode).toBe("invalid_input");

    // An expired token is refused, never refreshed behind the caller's back.
    const expired = await runAction({
      input: {},
      credential: { ...externalCredential, expiresAt: new Date(Date.now() - 1000).toISOString() },
    });
    expect(expired.status).toBe(409);
    expect((await expired.json()).errorCode).toBe("oauth_token_expired");

    // The refresh borrows the configured client's secret for the credential's client id.
    const configured = await request(
      "/api/oauth/configs/github",
      { clientId: "github-client-id", clientSecret: "github-client-secret" },
      "admin-token",
      "PUT",
    );
    expect(configured.status).toBe(200);
    const refreshed = await request(
      "/v1/credentials/refresh",
      { service: "github", credential: externalCredential },
      "runtime-token",
    );
    expect(refreshed.status).toBe(200);
    const refreshedBody = await refreshed.json();
    expect(refreshedBody.data.credential).toMatchObject({
      accessToken: "refreshed-access-token",
      refreshToken: "refreshed-refresh-token",
      profile: { accountId: "external-account" },
      metadata: { oauthClientConfig: { clientId: "github-client-id" } },
    });
    expect(JSON.stringify(refreshedBody)).not.toContain("github-client-secret");
    expect(bodies["https://github.com/login/oauth/access_token"]).toContain("client_secret=github-client-secret");
    expect(bodies["https://github.com/login/oauth/access_token"]).toContain("refresh_token=external-refresh-token");

    // GitHub declares no revocation endpoint.
    const revoked = await request(
      "/v1/credentials/revoke",
      { service: "github", credential: externalCredential },
      "runtime-token",
    );
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).data).toEqual({ revoked: "unsupported" });

    // The runtime kept no byte of any token.
    await runtime.close();
    const database = await readFile(join(options.dataDir, "connect.sqlite"));
    for (const secret of ["external-access-token", "external-refresh-token", "refreshed-access-token"]) {
      expect(database.includes(Buffer.from(secret))).toBe(false);
    }
  });

  it("tells a refresh the provider refused from one it did not answer", async () => {
    const options = await fixture();
    let answer: () => Response = () => Response.json({ error: "invalid_grant" }, { status: 400 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer()),
    );
    runtime = await createConnectorRuntime({ ...options, externalCredentials: true });
    await request(
      "/api/oauth/configs/github",
      { clientId: "github-client-id", clientSecret: "github-client-secret" },
      "admin-token",
      "PUT",
    );
    const body = { service: "github", credential: externalCredential };
    const refused = await request("/v1/credentials/refresh", body, "runtime-token");
    expect(refused.status).toBe(400);
    expect((await refused.json()).errorCode).toBe("oauth_token_refresh_failed");

    answer = () => new Response("", { status: 503 });
    const unanswered = await request("/v1/credentials/refresh", body, "runtime-token");
    expect(unanswered.status).toBe(502);
    expect((await unanswered.json()).errorCode).toBe("provider_error");

    answer = () => {
      throw new TypeError("fetch failed");
    };
    const unreachable = await request("/v1/credentials/refresh", body, "runtime-token");
    expect(unreachable.status).toBe(502);
    expect((await unreachable.json()).errorCode).toBe("provider_error");

    const noRefreshToken = await request(
      "/v1/credentials/refresh",
      { service: "github", credential: { ...externalCredential, refreshToken: undefined } },
      "runtime-token",
    );
    expect(noRefreshToken.status).toBe(409);
    expect((await noRefreshToken.json()).errorCode).toBe("oauth_token_expired");
  });

  it("keys an idempotent retry on the grant, never completes a key for a refused request, and refuses a token granted particular connections", async () => {
    stubGitHub();
    runtime = await createConnectorRuntime({ ...(await fixture()), externalCredentials: true });
    const key = crypto.randomUUID();
    const first = await runAction({ input: {}, credential: externalCredential }, { "idempotency-key": key });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    // A refreshed access token of the same grant is the same request; another account is not,
    // and neither is a credential of another grant that merely claims the same account id.
    const replayed = await runAction(
      { input: {}, credential: { ...externalCredential, accessToken: "rotated-access-token" } },
      { "idempotency-key": key },
    );
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual(firstBody);
    const other = await runAction(
      {
        input: {},
        credential: { ...externalCredential, profile: { ...externalCredential.profile, accountId: "other-account" } },
      },
      { "idempotency-key": key },
    );
    expect(other.status).toBe(409);
    expect((await other.json()).errorCode).toBe("idempotency_key_conflict");
    const claimed = await runAction(
      { input: {}, credential: { ...externalCredential, refreshToken: "someone-elses-refresh-token" } },
      { "idempotency-key": key },
    );
    expect(claimed.status).toBe(409);
    expect((await claimed.json()).errorCode).toBe("idempotency_key_conflict");
    // A credential the runtime refuses never completes the key: the holder refreshes and retries
    // under the same key, and the retry runs instead of replaying the refusal.
    const retryKey = crypto.randomUUID();
    const refused = await runAction(
      { input: {}, credential: { ...externalCredential, expiresAt: new Date(Date.now() - 1000).toISOString() } },
      { "idempotency-key": retryKey },
    );
    expect(refused.status).toBe(409);
    expect((await refused.json()).errorCode).toBe("oauth_token_expired");
    const retried = await runAction({ input: {}, credential: externalCredential }, { "idempotency-key": retryKey });
    expect(retried.status).toBe(200);
    // And a cached response is never replayed to a credential that could no longer execute.
    const soon = { ...externalCredential, expiresAt: new Date(Date.now() + 90_000).toISOString() };
    const soonKey = crypto.randomUUID();
    expect((await runAction({ input: {}, credential: soon }, { "idempotency-key": soonKey })).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 60_000);
      const lapsed = await runAction({ input: {}, credential: soon }, { "idempotency-key": soonKey });
      expect(lapsed.status).toBe(409);
      expect((await lapsed.json()).errorCode).toBe("oauth_token_expired");
    } finally {
      vi.useRealTimers();
    }

    const created = await request("/api/runtime-tokens", {
      name: "granted",
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: ["some-connection-id"],
    });
    expect(created.status).toBe(200);
    const grantedToken = (await created.json()).token;
    const granted = await runAction({ input: {}, credential: externalCredential }, {}, grantedToken);
    expect(granted.status).toBe(403);
    expect((await granted.json()).errorCode).toBe("connection_not_allowed");
    // Nor can such a token be served the open token's cached response under its key.
    const keyed = await runAction(
      { input: {}, credential: externalCredential },
      { "idempotency-key": key },
      grantedToken,
    );
    expect(keyed.status).toBe(403);
    expect((await keyed.json()).errorCode).toBe("connection_not_allowed");
  });

  it("exports a stored credential and deletes the row only at the revision it answered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: 1, login: "fixture-account", name: "Fixture Account" })),
    );
    runtime = await createConnectorRuntime({ ...(await fixture()), credentialExport: true });
    const saved = await request("/v1/connections/github/connect/api-key", { apiKey: "fixture-provider-secret" });
    expect(saved.status).toBe(200);
    const connection = (await saved.json()).data;

    expect((await request(`/v1/connections/by-id/${connection.id}/export`, undefined, "runtime-token")).status).toBe(
      401,
    );
    const exported = await request(`/v1/connections/by-id/${connection.id}/export`);
    expect(exported.status).toBe(200);
    const { data } = await exported.json();
    expect(data).toMatchObject({
      connection: { id: connection.id, service: "github", alias: connection.alias },
      credential: { authType: "api_key", apiKey: "fixture-provider-secret" },
      revision: expect.any(String),
    });

    const stale = await request(
      "/api/connections/github",
      { connectionName: connection.alias, revision: "another-revision" },
      "admin-token",
      "DELETE",
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("connection_changed");
    expect((await (await request("/v1/connections")).json()).data).toHaveLength(1);

    const deleted = await request(
      "/api/connections/github",
      { connectionName: connection.alias, revision: data.revision },
      "admin-token",
      "DELETE",
    );
    expect(deleted.status).toBe(200);
    expect((await (await request("/v1/connections")).json()).data).toEqual([]);
  });
});

async function fixture(services = ["github"]): Promise<ConnectorRuntimeOptions> {
  const root = await mkdtemp(join(tmpdir(), "open-connector-runtime-"));
  directories.push(root);
  const catalogDir = join(root, "catalog");
  await mkdir(catalogDir);
  for (const service of services)
    await cp(resolve(import.meta.dirname, `../../catalog/apps/${service}.json`), join(catalogDir, `${service}.json`));
  return {
    dataDir: join(root, "state"),
    publicOrigin,
    encryptionKey: "fixture-encryption-key",
    adminToken: "admin-token",
    runtimeToken: "runtime-token",
    assets: { catalogDir, migrationDirectory: resolve(import.meta.dirname, "../../migrations") },
  };
}

/** Run GitHub's current-user action under the runtime bearer with the given body and headers. */
function runAction(body: unknown, headers: Record<string, string> = {}, token = "runtime-token"): Promise<Response> {
  return runtime!.fetch(
    new Request(`${publicOrigin}/v1/actions/github.get_current_user`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

function request(
  path: string,
  body?: unknown,
  token = "admin-token",
  method = body ? "POST" : "GET",
): Promise<Response> {
  return runtime!.fetch(
    new Request(`${publicOrigin}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
