import type { ConnectorRuntime, ConnectorRuntimeOptions } from "./connector-runtime.ts";

import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectorRuntime } from "./connector-runtime.ts";

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
      redirectUri: null,
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
    expect(setup.oauthClient).toMatchObject({
      configured: true,
      expectedRedirectUri: "app://oauth/callback",
      redirectUri: "app://oauth/callback",
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

async function fixture(): Promise<ConnectorRuntimeOptions> {
  const root = await mkdtemp(join(tmpdir(), "open-connector-runtime-"));
  directories.push(root);
  const catalogDir = join(root, "catalog");
  await mkdir(catalogDir);
  for (const service of ["github"])
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
