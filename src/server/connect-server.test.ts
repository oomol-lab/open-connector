import type { IConnectionStore, StoredConnection } from "../connection-service.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { ActionSearchIndexProvider } from "../core/action-search.ts";
import type {
  ActionDefinition,
  ActionExecutor,
  ProviderDefinition,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { RuntimeActionHttpResult } from "./api/runtime-api.ts";
import type { Logger } from "./logger.ts";
import type {
  CompleteIdempotencyInput,
  IdempotencyClaimInput,
  IdempotencyClaimResult,
  IIdempotencyStore,
} from "./storage/idempotency-store.ts";
import type { IRunLogStore, RunLog, RunLogListInput, RunLogPage } from "./storage/runtime-store.ts";
import type { IRuntimeTokenStore, RuntimeTokenRecord } from "./storage/runtime-token-service.ts";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { ActionPolicyService as LocalActionPolicyService } from "../core/action-policy.ts";
import { buildActionSearchIndex } from "../core/action-search.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { actionInputMaxDepth } from "./actions/action-idempotency.ts";
import { ActionRunner } from "./actions/action-runner.ts";
import { registerStaticRoutes } from "./api/static-routes.ts";
import { ConnectServer } from "./connect-server.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { decodeRunLogCursor, encodeRunLogCursor } from "./storage/runtime-store.ts";
import { RuntimeTokenService } from "./storage/runtime-token-service.ts";

const apiKeyProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [{ type: "api_key" }],
  actions: [],
};

const oauthProvider: ProviderDefinition = {
  service: "oauth_example",
  displayName: "OAuth Example",
  categories: ["Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      scopes: ["read"],
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "appBearerToken",
          label: "App Bearer Token",
          inputType: "password",
          required: false,
          secret: true,
          location: "secretExtra",
        },
      ],
    },
  ],
  actions: [],
};

const echoAction: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo input.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

const followUpAction: ActionDefinition = {
  ...echoAction,
  id: "example.follow_up",
  name: "follow_up",
};

const catalogOnlyProvider: ProviderDefinition = {
  ...apiKeyProvider,
  service: "catalog_only",
  displayName: "Catalog Only",
  actions: [
    {
      ...echoAction,
      id: "catalog_only.query",
      service: "catalog_only",
      name: "query",
    },
  ],
};

const catalogOnlyOAuthProvider: ProviderDefinition = {
  ...oauthProvider,
  service: "oauth_catalog_only",
  displayName: "OAuth Catalog Only",
  actions: [
    {
      ...echoAction,
      id: "oauth_catalog_only.query",
      service: "oauth_catalog_only",
      name: "query",
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ConnectServer", () => {
  it("rejects connections for providers unavailable in the current runtime", async () => {
    const app = createTestServer([catalogOnlyProvider]).createApp();

    const response = await app.request("/api/connections/catalog_only", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "secret" } }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "provider_unavailable",
        message: "Catalog Only is not available in this runtime.",
      },
    });
  });

  it("rejects OAuth authorization for providers unavailable in the current runtime", async () => {
    const app = createTestServer([catalogOnlyOAuthProvider]).createApp();

    const response = await app.request("/api/oauth/authorizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: "oauth_catalog_only" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "provider_unavailable",
        message: "OAuth Catalog Only is not available in this runtime.",
      },
    });
  });

  it("serves catalog and standard connection errors without opening a port", async () => {
    const app = createTestServer([apiKeyProvider]).createApp();

    const catalogResponse = await app.request("/api/providers/example");
    expect(catalogResponse.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(catalogResponse.headers.get("cloudflare-cdn-cache-control")).toBe(
      "public, max-age=31536000, stale-while-revalidate=86400",
    );
    expect(catalogResponse.headers.get("vary")).toBe("Authorization, Cookie");
    await expect(catalogResponse.json()).resolves.toMatchObject({
      service: "example",
      displayName: "Example",
    });

    const connectionResponse = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: {} }),
    });

    expect(connectionResponse.status).toBe(400);
    expect(connectionResponse.headers.get("cache-control")).toBe("no-store");
    await expect(connectionResponse.json()).resolves.toEqual({
      error: {
        code: "invalid_input",
        message: "apiKey is required.",
      },
    });
  });

  it("rejects malformed JSON request bodies", async () => {
    const app = createTestServer([
      {
        ...apiKeyProvider,
        actions: [echoAction],
      },
    ]).createApp();

    const connection = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(connection.status).toBe(400);
    await expect(connection.json()).resolves.toEqual({
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON.",
      },
    });

    const action = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(action.status).toBe(400);
    await expect(action.json()).resolves.toEqual({
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON.",
      },
    });
  });

  it("rejects JSON request bodies that are not objects", async () => {
    const app = createTestServer([
      {
        ...apiKeyProvider,
        actions: [echoAction],
      },
    ]).createApp();

    for (const body of ["null", "[]", '"text"']) {
      const response = await app.request("/v1/actions/example.echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "invalid_json",
          message: "Request body must be a JSON object.",
        },
      });
    }
  });

  it("does not expose internal error messages to HTTP callers", async () => {
    const app = createTestServer([
      {
        ...apiKeyProvider,
        actions: [echoAction],
      },
    ]).createApp();

    const response = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Internal server error.",
      },
    });
  });

  it("requires local bearer tokens when configured", async () => {
    const app = createTestServer([apiKeyProvider], {
      auth: { adminToken: "local-token", runtimeToken: "runtime-token" },
    }).createApp();

    expect((await app.request("/health")).status).toBe(200);

    const unauthorized = await app.request("/api/providers/example");
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message: "A valid local bearer token is required.",
      },
    });

    const authorized = await app.request("/api/providers/example", {
      headers: { authorization: "Bearer local-token" },
    });
    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toMatchObject({
      service: "example",
    });

    const runtimeUnauthorized = await app.request("/v1/actions", {
      headers: { authorization: "Bearer local-token" },
    });
    expect(runtimeUnauthorized.status).toBe(401);

    const runtimeAuthorized = await app.request("/v1/actions", {
      headers: { authorization: "Bearer runtime-token" },
    });
    expect(runtimeAuthorized.status).toBe(200);

    const adminActionRun = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: {
        authorization: "Bearer local-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(adminActionRun.status).toBe(404);
  });

  it("serves API routes when static routes are disabled", async () => {
    const app = createTestServer([apiKeyProvider], { staticRoot: false }).createApp();

    expect((await app.request("/health")).status).toBe(200);
    const provider = await app.request("/api/providers/example");
    expect(provider.status).toBe(200);
    await expect(provider.json()).resolves.toMatchObject({
      service: "example",
    });
  });

  it("does not serve static fallback responses for missing v1 routes", async () => {
    const staticRoot = await createTestStaticRoot();
    try {
      const app = createTestServer([apiKeyProvider], { staticRoot }).createApp();

      const response = await app.request("/v1/does-not-exist");

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "not_found",
          message: "Not found.",
        },
      });
    } finally {
      await rm(staticRoot, { recursive: true, force: true });
    }
  });

  it("accepts OAuth client secret extra fields", async () => {
    const app = createTestServer([oauthProvider]).createApp();

    const response = await app.request("/api/oauth/configs/oauth_example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "client-id",
        clientSecret: "client-secret",
        secretExtra: {
          appBearerToken: "app-token",
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      service: "oauth_example",
      configured: true,
      clientId: "client-id",
    });
    expect(body).not.toHaveProperty("secretExtra");
    expect(JSON.stringify(body)).not.toContain("app-token");
  });

  it("deletes OAuth client configs", async () => {
    const app = createTestServer([oauthProvider]).createApp();

    const config = await app.request("/api/oauth/configs/oauth_example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "client-id",
        clientSecret: "client-secret",
      }),
    });
    expect(config.status).toBe(200);

    const deleted = await app.request("/api/oauth/configs/oauth_example", { method: "DELETE" });
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({
      service: "oauth_example",
      configured: false,
    });

    const configs = await app.request("/api/oauth/configs");
    expect(configs.status).toBe(200);
    await expect(configs.json()).resolves.toMatchObject([
      {
        service: "oauth_example",
        configured: false,
        clientId: null,
      },
    ]);
  });

  it("logs connection and OAuth steps without credential values", async () => {
    const { entries, logger } = createTestLogger();
    const app = createTestServer([apiKeyProvider, oauthProvider], { logger }).createApp();

    const connection = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authType: "api_key",
        connectionName: "work",
        values: {
          apiKey: "example-key",
        },
      }),
    });
    expect(connection.status).toBe(200);

    const config = await app.request("/api/oauth/configs/oauth_example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "oauth-client-id",
        clientSecret: "oauth-client-secret",
        secretExtra: {
          appBearerToken: "app-token",
        },
      }),
    });
    expect(config.status).toBe(200);

    const authorization = await app.request("/api/oauth/authorizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service: "oauth_example",
        connectionName: "work",
      }),
    });
    expect(authorization.status).toBe(200);

    const callback = await app.request("/oauth/callback?state=missing-state&code=secret-code");
    expect(callback.status).toBe(400);

    expect(entries).toEqual(
      expect.arrayContaining([
        {
          level: "info",
          fields: expect.objectContaining({
            service: "example",
            authType: "api_key",
            connectionName: "work",
          }),
          message: "connection started",
        },
        {
          level: "info",
          fields: expect.objectContaining({
            service: "example",
            authType: "api_key",
            connectionName: "work",
          }),
          message: "connection completed",
        },
        {
          level: "info",
          fields: expect.objectContaining({
            service: "oauth_example",
            connectionName: "work",
          }),
          message: "oauth authorization started",
        },
        {
          level: "info",
          fields: expect.objectContaining({
            service: "oauth_example",
            connectionName: "work",
            authorizationHost: "example.com",
            redirectUri: "http://localhost:3000/oauth/callback",
          }),
          message: "oauth authorization created",
        },
        {
          level: "info",
          fields: expect.objectContaining({
            hasState: true,
            hasCode: true,
          }),
          message: "oauth callback received",
        },
        {
          level: "warn",
          fields: expect.objectContaining({
            errorCode: "invalid_oauth_state",
            hasState: true,
            hasCode: true,
          }),
          message: "oauth callback failed",
        },
      ]),
    );
    const logOutput = JSON.stringify(entries);
    expect(logOutput).not.toContain("example-key");
    expect(logOutput).not.toContain("oauth-client-secret");
    expect(logOutput).not.toContain("app-token");
    expect(logOutput).not.toContain("missing-state");
    expect(logOutput).not.toContain("secret-code");
  });

  it("logs action runs without input and output values", async () => {
    const { entries, logger } = createTestLogger();
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        logger,
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    const connection = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });
    expect(connection.status).toBe(200);

    const run = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          message: "secret-message",
          nested: {
            token: "secret-token",
          },
        },
      }),
    });
    expect(run.status).toBe(200);

    expect(entries).toEqual(
      expect.arrayContaining([
        {
          level: "info",
          fields: expect.objectContaining({
            actionId: "example.echo",
            service: "example",
            caller: "http",
          }),
          message: "action run started",
        },
        {
          level: "info",
          fields: expect.objectContaining({
            actionId: "example.echo",
            service: "example",
            caller: "http",
            ok: true,
            executionId: expect.any(String),
            durationMs: expect.any(Number),
          }),
          message: "action run completed",
        },
      ]),
    );
    const logOutput = JSON.stringify(entries);
    expect(logOutput).not.toContain("example-key");
    expect(logOutput).not.toContain("secret-message");
    expect(logOutput).not.toContain("secret-token");
  });

  it("logs failed action runs with error codes", async () => {
    const { entries, logger } = createTestLogger();
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        actionPolicy: new LocalActionPolicyService({
          blockedActions: ["example.echo"],
        }),
        logger,
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    const run = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          message: "secret-message",
        },
      }),
    });
    expect(run.status).toBe(400);

    expect(entries).toEqual(
      expect.arrayContaining([
        {
          level: "warn",
          fields: expect.objectContaining({
            actionId: "example.echo",
            service: "example",
            caller: "http",
            ok: false,
            errorCode: "action_blocked",
            executionId: expect.any(String),
            durationMs: expect.any(Number),
          }),
          message: "action run failed",
        },
      ]),
    );
    expect(JSON.stringify(entries)).not.toContain("secret-message");
  });

  it("does not copy secret credential fields into fallback connection profiles", async () => {
    const app = createTestServer([
      {
        ...apiKeyProvider,
        auth: [
          {
            type: "api_key",
            extraFields: [
              {
                key: "workspaceId",
                label: "Workspace ID",
                inputType: "text",
                required: true,
                secret: false,
              },
              {
                key: "signingSecret",
                label: "Signing Secret",
                inputType: "password",
                required: true,
                secret: true,
              },
            ],
          },
        ],
      },
    ]).createApp();

    const connection = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authType: "api_key",
        values: {
          apiKey: "example-key",
          workspaceId: "workspace-123",
          signingSecret: "secret-token",
        },
      }),
    });
    expect(connection.status).toBe(200);
    const body = await connection.json();
    expect(body).toMatchObject({
      profile: {
        accountId: "example:workspaceId:workspace-123",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret-token");
  });

  it("serves the web console shell for deep frontend routes", async () => {
    const staticRoot = await createTestStaticRoot();
    try {
      const app = createTestServer([apiKeyProvider], { staticRoot }).createApp();

      const response = await app.request("/providers/github");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      await expect(response.text()).resolves.toContain('<div id="root"></div>');
    } finally {
      await rm(staticRoot, { recursive: true, force: true });
    }
  });

  it("does not serve the console shell for API and docs routes", async () => {
    const staticRoot = await createTestStaticRoot();
    try {
      const app = createTestServer([apiKeyProvider], { staticRoot }).createApp();

      expect((await app.request("/api/missing")).status).toBe(404);
      expect((await app.request("/v1/missing")).status).toBe(404);
      expect((await app.request("/mcp/missing")).status).toBe(404);
      expect((await app.request("/oauth/missing")).status).toBe(404);
      await expect((await app.request("/docs")).text()).resolves.not.toContain('<div id="root"></div>');
      expect((await app.request("/openapi.json")).headers.get("content-type")).toContain("application/json");
    } finally {
      await rm(staticRoot, { recursive: true, force: true });
    }
  });

  it("documents provider proxy requests in OpenAPI", async () => {
    const app = createTestServer([apiKeyProvider]).createApp();

    const response = await app.request("/openapi.json");
    const document = (await response.json()) as { paths: Record<string, unknown> };

    expect(document.paths["/v1/proxy/{service}"]).toMatchObject({
      post: {
        summary: "Proxy one provider API request.",
      },
    });
  });

  it("rejects non-POST MCP requests", async () => {
    const app = createTestServer([apiKeyProvider]).createApp();

    for (const method of ["DELETE", "GET"]) {
      const response = await app.request("/mcp", { method });

      expect(response.status).toBe(405);
      await expect(response.json()).resolves.toEqual({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      });
    }
  });

  it("accepts the shared OAuth callback route without a service path segment", async () => {
    const app = createTestServer([apiKeyProvider], { auth: { adminToken: "local-token" } }).createApp();

    const response = await app.request("/oauth/callback?state=missing&code=example-code");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_oauth_state",
        message: "OAuth state is missing or expired.",
      },
    });
  });

  it("lists OAuth connections after the callback completes", async () => {
    const app = createTestServer([oauthProvider]).createApp();
    const config = await app.request("/api/oauth/configs/oauth_example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "client-id",
        clientSecret: "client-secret",
        secretExtra: {
          appBearerToken: "app-token",
        },
      }),
    });
    expect(config.status).toBe(200);
    const authorization = await app.request("/api/oauth/authorizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: "oauth_example" }),
    });
    expect(authorization.status).toBe(200);
    const { state } = (await authorization.json()) as { state: string };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "access-token", token_type: "Bearer" })),
    );

    const callback = await app.request(`/oauth/callback?state=${state}&code=example-code`);
    const callbackText = await callback.text();

    expect(callback.status, callbackText).toBe(200);
    expect(callbackText).toContain("BroadcastChannel");
    expect(callbackText).toContain('"type":"oauth.completed"');
    expect(callbackText).toContain('"service":"oauth_example"');
    expect(callbackText).not.toContain("window.opener");
    expect(callbackText).not.toContain('postMessage(message,"*"');
    expect(callbackText).toContain("Connection ready");
    expect(callbackText).toContain("card");
    expect(callbackText).toContain("badge");
    expect(callbackText).toContain("Automatically closing in 5 seconds.");
    expect(callbackText).toContain("setTimeout");
    expect(callbackText).toContain("window.close()");
    const connections = await app.request("/api/connections");
    expect(connections.status).toBe(200);
    await expect(connections.json()).resolves.toMatchObject([
      {
        service: "oauth_example",
        authType: "oauth2",
        configured: true,
      },
    ]);
  });

  it("keeps the console shell public while protecting admin APIs", async () => {
    const staticRoot = await createTestStaticRoot();
    try {
      const app = createTestServer([apiKeyProvider], {
        staticRoot,
        auth: { adminToken: "local-token" },
      }).createApp();

      expect((await app.request("/overview")).status).toBe(200);
      const consoleScript = await app.request("/assets/console.js");
      expect(consoleScript.status).toBe(200);
      expect(consoleScript.headers.get("cache-control")).not.toBe("no-store");
      expect((await app.request("/api/providers")).status).toBe(401);
      expect((await app.request("/docs")).status).toBe(401);
      expect((await app.request("/api/providers")).headers.get("cache-control")).toBe("no-store");

      const authorized = await app.request("/api/providers", {
        headers: { authorization: "Bearer local-token" },
      });
      expect(authorized.status).toBe(200);
      expect(authorized.headers.get("set-cookie")).toContain("oomol_connect_admin_session=");
      expect(authorized.headers.get("set-cookie")).not.toContain("local-token");
      expect(authorized.headers.get("set-cookie")).toContain("Max-Age=2592000");

      const logout = await app.request("/api/auth/logout", { method: "POST" });
      expect(logout.status).toBe(200);
      expect(logout.headers.get("set-cookie")).toContain("oomol_connect_admin_session=;");
      expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    } finally {
      await rm(staticRoot, { recursive: true, force: true });
    }
  });

  it("reports local admin auth session state", async () => {
    const app = createTestServer([apiKeyProvider], {
      auth: { adminToken: "local-token" },
    }).createApp();

    const unauthenticated = await app.request("/api/auth/session");
    expect(unauthenticated.status).toBe(200);
    await expect(unauthenticated.json()).resolves.toEqual({
      adminAuthConfigured: true,
      authenticated: false,
    });

    const bearer = await app.request("/api/auth/session", {
      headers: { authorization: "Bearer local-token" },
    });
    expect(bearer.status).toBe(200);
    expect(bearer.headers.get("set-cookie")).toContain("oomol_connect_admin_session=");
    expect(bearer.headers.get("set-cookie")).not.toContain("local-token");
    await expect(bearer.json()).resolves.toEqual({
      adminAuthConfigured: true,
      authenticated: true,
    });

    const authorized = await app.request("/api/providers", {
      headers: { authorization: "Bearer local-token" },
    });
    const cookie = authorized.headers.get("set-cookie")?.split(";")[0] ?? "";
    const cookieSession = await app.request("/api/auth/session", {
      headers: { cookie },
    });
    expect(cookieSession.status).toBe(200);
    await expect(cookieSession.json()).resolves.toEqual({
      adminAuthConfigured: true,
      authenticated: true,
    });
  });

  it("expires local admin auth sessions", async () => {
    const issuedAt = Date.parse("2026-07-03T00:00:00.000Z");
    const now = vi.spyOn(Date, "now").mockReturnValue(issuedAt);
    const app = createTestServer([apiKeyProvider], {
      auth: { adminToken: "local-token" },
    }).createApp();

    const authorized = await app.request("/api/providers", {
      headers: { authorization: "Bearer local-token" },
    });
    const cookie = authorized.headers.get("set-cookie")?.split(";")[0] ?? "";

    now.mockReturnValue(issuedAt + 2_592_000_000 + 1);
    const expiredSession = await app.request("/api/auth/session", {
      headers: { cookie },
    });

    expect(expiredSession.status).toBe(200);
    await expect(expiredSession.json()).resolves.toEqual({
      adminAuthConfigured: true,
      authenticated: false,
    });
  });

  it("reports no local admin auth requirement when no admin token is configured", async () => {
    const app = createTestServer([apiKeyProvider]).createApp();

    const response = await app.request("/api/auth/session");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      adminAuthConfigured: false,
      authenticated: true,
    });
  });

  it("does not accept the admin token for stored runtime token access", async () => {
    const runtimeTokens = new RuntimeTokenService(new MemoryRuntimeTokenStore());
    const app = createTestServer([apiKeyProvider], {
      auth: { adminToken: "local-token" },
      runtimeTokens,
    }).createApp();

    const created = await app.request("/api/runtime-tokens", {
      method: "POST",
      headers: {
        authorization: "Bearer local-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Claude Desktop" }),
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { token: string; record: RuntimeTokenRecord };

    const adminTokenRuntimeCall = await app.request("/v1/actions", {
      headers: { authorization: "Bearer local-token" },
    });
    expect(adminTokenRuntimeCall.status).toBe(401);

    const runtimeTokenCall = await app.request("/v1/actions", {
      headers: { authorization: `Bearer ${createdBody.token}` },
    });
    expect(runtimeTokenCall.status).toBe(200);
  });

  it("manages runtime tokens and gates runtime API calls after one is created", async () => {
    const runtimeTokens = new RuntimeTokenService(new MemoryRuntimeTokenStore());
    const app = createTestServer([apiKeyProvider], { runtimeTokens }).createApp();

    const initiallyOpen = await app.request("/v1/actions");
    expect(initiallyOpen.status).toBe(200);

    const created = await app.request("/api/runtime-tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Claude Desktop" }),
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { token: string; record: RuntimeTokenRecord };
    expect(createdBody.token).toMatch(/^oct_/);
    expect(createdBody.record).toMatchObject({
      name: "Claude Desktop",
    });
    expect(JSON.stringify(createdBody.record)).not.toContain(createdBody.token);

    const listed = await app.request("/api/runtime-tokens");
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject([
      {
        id: createdBody.record.id,
        name: "Claude Desktop",
      },
    ]);

    const unauthorized = await app.request("/v1/actions");
    expect(unauthorized.status).toBe(401);

    const authorized = await app.request("/v1/actions", {
      headers: { authorization: `Bearer ${createdBody.token}` },
    });
    expect(authorized.status).toBe(200);

    const revoked = await app.request(`/api/runtime-tokens/${createdBody.record.id}`, {
      method: "DELETE",
    });
    expect(revoked.status).toBe(200);
    await expect(revoked.json()).resolves.toEqual({ id: createdBody.record.id, revoked: true });

    const listedAfterRevoke = await app.request("/api/runtime-tokens");
    expect(listedAfterRevoke.status).toBe(200);
    await expect(listedAfterRevoke.json()).resolves.toEqual([]);

    const reopened = await app.request("/v1/actions", {
      headers: { authorization: `Bearer ${createdBody.token}` },
    });
    expect(reopened.status).toBe(200);
  });

  it("stores redacted run log summaries for HTTP action execution", async () => {
    const runs = new MemoryRunLogStore();
    const server = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
        runs,
      },
    );
    const app = server.createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const longQuery = "a".repeat(600);
    const response = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          query: longQuery,
          apiKey: "secret-key",
          nested: { password: "secret-password" },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(runs.list()).resolves.toMatchObject({
      items: [
        {
          actionId: "example.echo",
          caller: "http",
          ok: true,
          connectionProfile: {
            accountId: "example-account",
            displayName: "Example Account",
            grantedScopes: [],
          },
          inputSummary: {
            query: `${"a".repeat(500)}[truncated]`,
            apiKey: "[redacted]",
            nested: { password: "[redacted]" },
          },
        },
      ],
    });
  });

  it("passes local transit files to action executors", async () => {
    const rootDir = await createTempDir();
    try {
      const app = createTestServer(
        [
          {
            ...apiKeyProvider,
            actions: [echoAction],
          },
        ],
        {
          providerLoader: new TransitEchoProviderLoader(),
          transitFiles: createTestTransitFiles(rootDir),
        },
      ).createApp();

      await app.request("/api/connections/example", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
      });

      const response = await app.request("/v1/actions/example.echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        success: true,
        data: {
          fileId: expect.stringMatching(/^[a-f0-9]{32}\.txt$/),
          downloadUrl: expect.stringContaining("http://localhost:3000/api/files/"),
          sizeBytes: 13,
        },
      });

      const download = await app.request(new URL(body.data.downloadUrl).pathname);
      expect(download.status).toBe(200);
      await expect(download.text()).resolves.toBe("from executor");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("creates named connections and runs actions with aliases", async () => {
    const runs = new MemoryRunLogStore();
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
        runs,
      },
    ).createApp();

    const connection = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authType: "api_key",
        connectionName: "work",
        values: { apiKey: "work-key" },
      }),
    });
    expect(connection.status).toBe(200);
    await expect(connection.json()).resolves.toMatchObject({
      service: "example",
      connectionName: "work",
      default: false,
    });

    const run = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oo-connector-alias": "work",
      },
      body: JSON.stringify({ input: { message: "hello" } }),
    });
    expect(run.status).toBe(200);
    await expect(run.json()).resolves.toMatchObject({
      success: true,
      data: { message: "hello" },
    });
    await expect(runs.list()).resolves.toMatchObject({
      items: [
        {
          connectionProfile: {
            displayName: "Example Account",
          },
        },
      ],
    });
  });

  it("renders agent guides with current connection and provider permissions", async () => {
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [
            {
              ...echoAction,
              requiredScopes: ["messages.read"],
              providerPermissions: ["messages:read"],
            },
          ],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const response = await app.request("/api/actions/example.echo/agent.md");

    expect(response.status).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain("## Current Connection");
    expect(markdown).toContain("Example Account");
    expect(markdown).toContain("`example-account`");
    expect(markdown).toContain("`messages:read`");
  });

  it("renders markdown descriptions and escapes union type separators in parameter tables", async () => {
    const app = createTestServer([
      {
        ...apiKeyProvider,
        actions: [
          {
            ...echoAction,
            description: "Echo **input**.\n\n- Supports markdown descriptions.",
            inputSchema: {
              type: "object",
              properties: {
                cc: {
                  anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
                  description: "Cc recipients.\n\n- Use **email** addresses.\n- Accepts multiple values.",
                },
              },
            },
          },
        ],
      },
    ]).createApp();

    const response = await app.request("/api/actions/example.echo/agent.md");

    expect(response.status).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain("Echo **input**.\n\n- Supports markdown descriptions.");
    expect(markdown).toContain("| `cc` | No       | `string \\| array` |");
    expect(markdown).toContain(
      "- `cc`\n\n  Cc recipients.\n\n  - Use **email** addresses.\n  - Accepts multiple values.",
    );
    expect(markdown).not.toContain("| `cc` | No       | `string | array` |");
  });

  it("applies local action policy before executing HTTP actions", async () => {
    const runs = new MemoryRunLogStore();
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        actionPolicy: new LocalActionPolicyService({
          blockedActions: ["example.echo"],
        }),
        providerLoader: new EchoProviderLoader(),
        runs,
      },
    ).createApp();

    const response = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "action_blocked",
    });
    await expect(runs.list()).resolves.toMatchObject({
      items: [
        {
          actionId: "example.echo",
          ok: false,
          errorCode: "action_blocked",
        },
      ],
    });
  });

  it("serves the public v1 runtime catalog and action envelope", async () => {
    const actionWithFollowUp: ActionDefinition = {
      ...echoAction,
      followUpActions: ["example.follow_up"],
    };
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [actionWithFollowUp, followUpAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const apiActions = await app.request("/api/actions");
    expect(apiActions.status).toBe(200);
    expect(apiActions.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");

    const apiAction = await app.request("/api/actions/example.echo");
    expect(apiAction.status).toBe(200);
    expect(apiAction.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");

    const providers = await app.request("/v1/providers");
    expect(providers.status).toBe(200);
    expect(providers.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    await expect(providers.json()).resolves.toMatchObject({
      success: true,
      data: [
        {
          service: "example",
          displayName: "Example",
          categories: [{ id: "Developer Tools", displayName: "Developer Tools" }],
          authTypes: ["api_key"],
        },
      ],
    });

    const actionServices = await app.request("/v1/actions");
    expect(actionServices.status).toBe(200);
    expect(actionServices.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    await expect(actionServices.json()).resolves.toMatchObject({
      success: true,
      data: [{ service: "example" }],
    });

    const actions = await app.request("/v1/actions?service=example");
    expect(actions.status).toBe(200);
    expect(actions.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    await expect(actions.json()).resolves.toMatchObject({
      success: true,
      data: [
        {
          id: "example.echo",
          service: "example",
          followUpActions: [{ actionId: "example.follow_up" }],
        },
        {
          id: "example.follow_up",
          service: "example",
          followUpActions: [],
        },
      ],
    });

    const apiSearch = await app.request("/api/actions/search?q=echo");
    expect(apiSearch.status).toBe(200);
    expect(apiSearch.headers.get("cache-control")).toBe("no-store");
    const apiSearchResults = (await apiSearch.json()) as Array<{
      id: string;
      service: string;
      name: string;
      authenticated: boolean;
      inputSchema: Record<string, unknown>;
      outputSchema: Record<string, unknown>;
    }>;
    expect(apiSearchResults[0]).toMatchObject({
      id: "example.echo",
      service: "example",
      name: "echo",
      authenticated: true,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    });

    const runtimeSearch = await app.request("/v1/actions/search?q=echo");
    expect(runtimeSearch.status).toBe(200);
    expect(runtimeSearch.headers.get("cache-control")).toBe("no-store");
    const runtimeSearchBody = (await runtimeSearch.json()) as {
      success: boolean;
      data: Array<{
        id: string;
        service: string;
        name: string;
        description: string;
        authenticated: boolean;
        inputSchema: Record<string, unknown>;
        outputSchema: Record<string, unknown>;
      }>;
    };
    expect(runtimeSearchBody.success).toBe(true);
    expect(runtimeSearchBody.data[0]).toMatchObject({
      id: "example.echo",
      service: "example",
      name: "echo",
      description: "Echo input.",
      authenticated: true,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    });

    const action = await app.request("/v1/actions/example.echo");
    expect(action.status).toBe(200);
    expect(action.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    await expect(action.json()).resolves.toMatchObject({
      success: true,
      meta: {},
      data: {
        id: "example.echo",
        service: "example",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        followUpActions: [{ actionId: "example.follow_up" }],
        asyncLifecycle: null,
      },
    });

    const run = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { message: "hello" } }),
    });
    expect(run.status).toBe(200);
    expect(run.headers.get("cache-control")).toBe("no-store");
    expect(run.headers.get("cloudflare-cdn-cache-control")).toBeNull();
    await expect(run.json()).resolves.toMatchObject({
      success: true,
      message: "OK",
      data: { message: "hello" },
      meta: {
        actionId: "example.echo",
      },
    });
  });

  it("drops stale action search index hits that are missing from the catalog", async () => {
    const staleAction: ActionDefinition = {
      ...echoAction,
      id: "missing.ghost",
      service: "missing",
      name: "ghost",
      description: "Echo ghost input.",
    };
    const actionSearch: ActionSearchIndexProvider = {
      get: async () => buildActionSearchIndex([echoAction, staleAction]),
    };
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      { actionSearch },
    ).createApp();

    const apiSearch = await app.request("/api/actions/search?q=echo");
    expect(apiSearch.status).toBe(200);
    const apiResults = (await apiSearch.json()) as Array<{ id: string; inputSchema: Record<string, unknown> }>;
    expect(apiResults.map((result) => result.id)).toEqual(["example.echo"]);
    expect(apiResults[0]).toMatchObject({ authenticated: false });
    expect(apiResults[0]?.inputSchema).toEqual({ type: "object" });

    const runtimeSearch = await app.request("/v1/actions/search?q=echo");
    expect(runtimeSearch.status).toBe(200);
    const runtimeBody = (await runtimeSearch.json()) as {
      success: boolean;
      data: Array<{ id: string; authenticated: boolean; outputSchema: Record<string, unknown> }>;
    };
    expect(runtimeBody.success).toBe(true);
    expect(runtimeBody.data.map((result) => result.id)).toEqual(["example.echo"]);
    expect(runtimeBody.data[0]).toMatchObject({ authenticated: false });
    expect(runtimeBody.data[0]?.outputSchema).toEqual({ type: "object" });
  });

  it("serves v1 apps and authenticated service views without leaking credentials", async () => {
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const apps = await app.request("/v1/apps");
    expect(apps.status).toBe(200);
    const appsBody = await apps.json();
    expect(appsBody).toMatchObject({
      success: true,
      meta: {},
      data: [
        {
          id: "example:default",
          service: "example",
          alias: "default",
          authType: "api_key",
          status: "active",
          isDefault: true,
        },
      ],
    });
    expect(JSON.stringify(appsBody)).not.toContain("example-key");

    const authenticated = await app.request("/v1/apps/authenticated?service=example&service=missing");
    expect(authenticated.status).toBe(200);
    await expect(authenticated.json()).resolves.toMatchObject({
      success: true,
      data: ["example"],
    });
  });

  it("replays completed idempotent action requests while preserving no-key behavior", async () => {
    let executions = 0;
    const runs = new MemoryRunLogStore();
    const providerLoader = new ActionProviderLoader(async (input, context) => {
      executions += 1;
      await context.getCredential("example");
      return { ok: true, output: input };
    });
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      { providerLoader, runs },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    for (let index = 0; index < 2; index += 1) {
      const response = await app.request("/v1/actions/example.echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { message: "without-key" } }),
      });
      expect(response.status).toBe(200);
    }

    const first = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "request-1",
        "x-oo-connector-alias": "default",
      },
      body: JSON.stringify({
        input: { message: "hello", nested: { first: 1, second: 2 } },
      }),
    });
    const firstBody = await first.json();
    const replay = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "request-1",
      },
      body: JSON.stringify({
        input: { nested: { second: 2, first: 1 }, message: "hello" },
      }),
    });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("cache-control")).toBe("no-store");
    await expect(replay.json()).resolves.toEqual(firstBody);
    expect(executions).toBe(3);
    expect((await runs.list()).items).toHaveLength(3);
  });

  it("rejects idempotency keys reused for another input, connection, or action", async () => {
    let executions = 0;
    const providerLoader = new ActionProviderLoader(async (input, context) => {
      executions += 1;
      await context.getCredential("example");
      return { ok: true, output: input };
    });
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction, followUpAction],
        },
      ],
      { providerLoader },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });
    const headers = {
      "content-type": "application/json",
      "idempotency-key": "request-conflict",
    };
    const first = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { message: "hello" } }),
    });
    expect(first.status).toBe(200);

    const conflicts = await Promise.all([
      app.request("/v1/actions/example.echo", {
        method: "POST",
        headers,
        body: JSON.stringify({ input: { message: "different" } }),
      }),
      app.request("/v1/actions/example.echo", {
        method: "POST",
        headers: { ...headers, "x-oo-connector-alias": "work" },
        body: JSON.stringify({ input: { message: "hello" } }),
      }),
      app.request("/v1/actions/example.follow_up", {
        method: "POST",
        headers,
        body: JSON.stringify({ input: { message: "hello" } }),
      }),
    ]);

    for (const conflict of conflicts) {
      expect(conflict.status).toBe(409);
      await expect(conflict.json()).resolves.toMatchObject({
        success: false,
        errorCode: "idempotency_key_conflict",
      });
    }
    expect(executions).toBe(1);
  });

  it("does not dispatch concurrent requests with the same idempotency key twice", async () => {
    let executions = 0;
    let notifyStarted: (() => void) | undefined;
    let releaseExecutor: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseExecutor = resolve;
    });
    const providerLoader = new ActionProviderLoader(async (input, context) => {
      executions += 1;
      await context.getCredential("example");
      notifyStarted?.();
      await gate;
      return { ok: true, output: input };
    });
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      { providerLoader },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });
    const request = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "request-concurrent",
      },
      body: JSON.stringify({ input: { message: "hello" } }),
    };
    const first = app.request("/v1/actions/example.echo", request);
    await started;

    const duplicate = await app.request("/v1/actions/example.echo", request);
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      success: false,
      errorCode: "idempotency_request_in_progress",
    });

    releaseExecutor?.();
    expect((await first).status).toBe(200);
    expect(executions).toBe(1);
  });

  it("replays terminal action failures for an idempotency key", async () => {
    let executions = 0;
    const providerLoader = new ActionProviderLoader(async (_input, context) => {
      executions += 1;
      await context.getCredential("example");
      return {
        ok: false,
        error: { code: "provider_error", message: "Provider rejected the request." },
      };
    });
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      { providerLoader },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });
    const request = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "request-failure",
      },
      body: JSON.stringify({ input: { message: "hello" } }),
    };
    const first = await app.request("/v1/actions/example.echo", request);
    const firstBody = await first.json();
    const replay = await app.request("/v1/actions/example.echo", request);

    expect(first.status).toBe(500);
    expect(replay.status).toBe(500);
    await expect(replay.json()).resolves.toEqual(firstBody);
    expect(executions).toBe(1);
  });

  it("keeps uncertain idempotent executions in progress instead of retrying them", async () => {
    let executions = 0;
    const providerLoader = new ActionProviderLoader(async (_input, context) => {
      executions += 1;
      await context.getCredential("example");
      throw new Error("uncertain provider outcome");
    });
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      { providerLoader },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });
    const request = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "request-uncertain",
      },
      body: JSON.stringify({ input: { message: "hello" } }),
    };
    const first = await app.request("/v1/actions/example.echo", request);
    expect(first.status).toBe(500);
    await expect(first.json()).resolves.toEqual({
      error: { code: "internal_error", message: "Internal server error." },
    });

    const duplicate = await app.request("/v1/actions/example.echo", request);
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      success: false,
      errorCode: "idempotency_request_in_progress",
    });
    expect(executions).toBe(1);
  });

  it("does not retry an action when persisting its completed response fails", async () => {
    let executions = 0;
    const providerLoader = new ActionProviderLoader(async (input, context) => {
      executions += 1;
      await context.getCredential("example");
      return { ok: true, output: input };
    });
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader,
        idempotency: new FailingCompleteIdempotencyStore(),
      },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });
    const request = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "request-persistence-failure",
      },
      body: JSON.stringify({ input: { message: "hello" } }),
    };

    expect((await app.request("/v1/actions/example.echo", request)).status).toBe(500);
    const duplicate = await app.request("/v1/actions/example.echo", request);
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      success: false,
      errorCode: "idempotency_request_in_progress",
    });
    expect(executions).toBe(1);
  });

  it("rejects invalid idempotency keys before dispatching an action", async () => {
    let executions = 0;
    const providerLoader = new ActionProviderLoader(async (input) => {
      executions += 1;
      return { ok: true, output: input };
    });
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      { providerLoader },
    ).createApp();

    const response = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "x".repeat(256),
      },
      body: JSON.stringify({ input: {} }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "invalid_input",
    });
    expect(executions).toBe(0);
  });

  it("rejects deeply nested idempotent inputs before claiming the key", async () => {
    let executions = 0;
    const providerLoader = new ActionProviderLoader(async (input) => {
      executions += 1;
      return { ok: true, output: input };
    });
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      { providerLoader },
    ).createApp();
    let input: unknown = "leaf";
    for (let depth = 0; depth <= actionInputMaxDepth; depth += 1) {
      input = { child: input };
    }
    const headers = {
      "content-type": "application/json",
      "idempotency-key": "request-too-deep",
    };

    const rejected = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers,
      body: JSON.stringify({ input }),
    });
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({
      success: false,
      errorCode: "invalid_input",
      message: `Action input must not exceed an object/array nesting depth of ${actionInputMaxDepth} levels when Idempotency-Key is provided.`,
    });
    expect(executions).toBe(0);

    const accepted = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { child: "leaf" } }),
    });
    expect(accepted.status).toBe(200);
    expect(executions).toBe(1);
  });

  it("maps v1 runtime failures to stable envelopes", async () => {
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    const unknown = await app.request("/v1/actions/example.missing");
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({
      success: false,
      errorCode: "invalid_input",
      meta: { actionId: "example.missing" },
    });

    const missingConnection = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oomol-connector-alias": "work",
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(missingConnection.status).toBe(404);
    await expect(missingConnection.json()).resolves.toMatchObject({
      success: false,
      errorCode: "connection_not_found",
    });

    const proxy = await app.request("/v1/proxy/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "/anything", method: "GET" }),
    });
    expect(proxy.status).toBe(501);
    await expect(proxy.json()).resolves.toMatchObject({
      success: false,
      errorCode: "proxy_not_supported",
    });
  });

  it("executes provider proxy requests through the v1 runtime envelope", async () => {
    const app = createTestServer([apiKeyProvider], {
      providerLoader: new ProxyProviderLoader(),
    }).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" }, connectionName: "work" }),
    });

    const response = await app.request("/v1/proxy/example", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oomol-connector-alias": "work",
      },
      body: JSON.stringify({
        endpoint: "/items",
        method: "post",
        query: { limit: 2 },
        headers: { accept: "application/json" },
        body: { name: "Example" },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "OK",
      data: {
        status: 202,
        headers: { "content-type": "application/json" },
        data: {
          endpoint: "/items",
          method: "POST",
          query: { limit: 2 },
          headers: { accept: "application/json" },
          body: { name: "Example" },
          authType: "api_key",
        },
      },
      meta: {},
    });
  });

  it("rejects invalid provider proxy endpoints", async () => {
    const app = createTestServer([apiKeyProvider], {
      providerLoader: new ProxyProviderLoader(),
    }).createApp();

    const response = await app.request("/v1/proxy/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://evil.test/a", method: "GET" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "invalid_input",
    });
  });

  it("maps provider proxy failures to stable v1 envelopes", async () => {
    const app = createTestServer([apiKeyProvider], {
      providerLoader: new ProxyProviderLoader(async () => ({
        ok: false,
        error: {
          code: "authorization_failed",
          message: "Provider rejected the credential.",
          details: { status: 401 },
        },
      })),
    }).createApp();

    const response = await app.request("/v1/proxy/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "/items", method: "GET" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "authorization_failed",
      message: "Provider rejected the credential.",
      data: { status: 401 },
    });
  });

  it("uploads, serves, and deletes local transit files", async () => {
    const rootDir = await createTempDir();
    try {
      const app = createTestServer([apiKeyProvider], {
        transitFiles: createTestTransitFiles(rootDir),
      }).createApp();
      const form = new FormData();
      form.set("file", new File(["hello transit"], "report.TXT", { type: "text/plain" }));

      const upload = await app.request("/api/files", {
        method: "POST",
        body: form,
      });
      expect(upload.status).toBe(200);
      const uploadBody = (await upload.json()) as {
        fileId: string;
        downloadUrl: string;
        sizeBytes: number;
        name: string;
        mimeType: string;
      };
      expect(uploadBody.fileId).toMatch(/^[a-f0-9]{32}\.txt$/);
      expect(uploadBody.downloadUrl).toBe(`http://localhost:3000/api/files/${uploadBody.fileId}`);
      expect(uploadBody.sizeBytes).toBe(13);
      expect(uploadBody.name).toBe("report.TXT");
      expect(uploadBody.mimeType).toBe("text/plain");

      const download = await app.request(`/api/files/${uploadBody.fileId}`);
      expect(download.status).toBe(200);
      expect(download.headers.get("content-type")).toBe("text/plain");
      expect(download.headers.get("content-length")).toBe("13");
      expect(download.headers.get("content-disposition")).toBe('attachment; filename="report.TXT"');
      await expect(download.text()).resolves.toBe("hello transit");

      const deleted = await app.request(`/api/files/${uploadBody.fileId}`, {
        method: "DELETE",
      });
      expect(deleted.status).toBe(200);
      await expect(deleted.json()).resolves.toEqual({ fileId: uploadBody.fileId, deleted: true });

      const missing = await app.request(`/api/files/${uploadBody.fileId}`);
      expect(missing.status).toBe(404);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps transit file downloads public when admin auth is enabled", async () => {
    const rootDir = await createTempDir();
    try {
      const app = createTestServer([apiKeyProvider], {
        auth: { adminToken: "local-token" },
        transitFiles: createTestTransitFiles(rootDir),
      }).createApp();
      const form = new FormData();
      form.set("file", new File(["download me"], "note.txt"));

      const unauthorizedUpload = await app.request("/api/files", {
        method: "POST",
        body: form,
      });
      expect(unauthorizedUpload.status).toBe(401);

      const authorizedForm = new FormData();
      authorizedForm.set("file", new File(["download me"], "note.txt"));
      const upload = await app.request("/api/files", {
        method: "POST",
        headers: { authorization: "Bearer local-token" },
        body: authorizedForm,
      });
      expect(upload.status).toBe(200);
      const uploadBody = (await upload.json()) as { fileId: string };

      const download = await app.request(`/api/files/${uploadBody.fileId}`);
      expect(download.status).toBe(200);
      await expect(download.text()).resolves.toBe("download me");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects transit files over the configured local limit", async () => {
    const rootDir = await createTempDir();
    try {
      const app = createTestServer([apiKeyProvider], {
        transitFiles: createTestTransitFiles(rootDir, { maxBytes: 4 }),
      }).createApp();
      const form = new FormData();
      form.set("file", new File(["12345"], "large.bin"));

      const response = await app.request("/api/files", {
        method: "POST",
        body: form,
      });

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "file_too_large",
        },
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("paginates run logs through the web console API", async () => {
    const runs = new MemoryRunLogStore();
    await runs.add(createRunLog("run-1", "2026-06-30T00:00:00.000Z"));
    await runs.add(createRunLog("run-2", "2026-06-30T00:00:01.000Z"));
    await runs.add(createRunLog("run-3", "2026-06-30T00:00:02.000Z"));
    const app = createTestServer([apiKeyProvider], { runs }).createApp();

    const first = await app.request("/api/runs?limit=2");
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as RunLogPage;
    expect(firstBody.items.map((run) => run.id)).toEqual(["run-3", "run-2"]);
    expect(firstBody.nextCursor).toBeTruthy();

    const query = new URLSearchParams({ limit: "2", cursor: firstBody.nextCursor! });
    const second = await app.request(`/api/runs?${query}`);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as RunLogPage;
    expect(secondBody.items.map((run) => run.id)).toEqual(["run-1"]);
    expect(secondBody.nextCursor).toBeUndefined();

    const invalid = await app.request("/api/runs?limit=500");
    expect(invalid.status).toBe(400);
  });

  it("filters run logs by service through the web console API", async () => {
    const runs = new MemoryRunLogStore();
    await runs.add({
      ...createRunLog("gmail-1", "2026-06-30T00:00:00.000Z"),
      actionId: "mail.search_threads",
      service: "gmail",
    });
    await runs.add({
      ...createRunLog("hackernews-1", "2026-06-30T00:00:01.000Z"),
      actionId: "news.get_best_stories",
      service: "hackernews",
    });
    await runs.add({
      ...createRunLog("gmail-2", "2026-06-30T00:00:02.000Z"),
      actionId: "mail.list_threads",
      service: "gmail",
    });
    const app = createTestServer([apiKeyProvider], { runs }).createApp();

    const response = await app.request("/api/runs?service=gmail&limit=1");
    expect(response.status).toBe(200);
    const firstBody = (await response.json()) as RunLogPage;
    expect(firstBody.items.map((run) => run.id)).toEqual(["gmail-2"]);
    expect(firstBody.nextCursor).toBeTruthy();

    const query = new URLSearchParams({ service: "gmail", limit: "1", cursor: firstBody.nextCursor! });
    const second = await app.request(`/api/runs?${query}`);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as RunLogPage;
    expect(secondBody.items.map((run) => run.id)).toEqual(["gmail-1"]);
    expect(secondBody.nextCursor).toBeUndefined();
  });
});

interface CreateTestServerOptions {
  auth?: { adminToken?: string; runtimeToken?: string };
  actionPolicy?: ActionPolicyService;
  actionSearch?: ActionSearchIndexProvider;
  providerLoader?: IProviderLoader;
  logger?: Logger;
  idempotency?: IIdempotencyStore;
  runtimeTokens?: RuntimeTokenService;
  runs?: MemoryRunLogStore;
  staticRoot?: string | false;
  transitFiles?: TransitFileService;
}

function createTestServer(providers: ProviderDefinition[], options: CreateTestServerOptions = {}): ConnectServer {
  const catalog = createCatalogStore(providers, {
    executableActionIds: ["example.echo"],
  });
  const providerLoader = options.providerLoader ?? new EmptyProviderLoader();
  const idempotency = options.idempotency ?? new MemoryIdempotencyStore();
  const runtimeTokens = options.runtimeTokens ?? new RuntimeTokenService(new MemoryRuntimeTokenStore());
  const runs = options.runs ?? new MemoryRunLogStore();
  const connections = new ConnectionService({
    catalog,
    providerLoader,
    store: new MemoryConnectionStore(),
  });
  const clientConfigs = new OAuthClientConfigService({
    catalog,
    origin: "http://localhost:3000",
    store: new MemoryOAuthClientConfigStore(),
  });
  const transitFiles =
    options.transitFiles ??
    new TransitFileService({
      rootDir: ".tmp/test-transit-files",
      publicOrigin: "http://localhost:3000",
      ttlSeconds: 60,
      maxBytes: 1024 * 1024,
    });

  const actionRunner = new ActionRunner({
    catalog,
    providerLoader,
    connections,
    runs,
    transitFiles,
    actionPolicy: options.actionPolicy,
    logger: options.logger,
  });
  const staticRoot = typeof options.staticRoot === "string" ? options.staticRoot : undefined;

  return new ConnectServer({
    catalog,
    providerLoader,
    connections,
    oauthClientConfigs: clientConfigs,
    oauthFlow: new OAuthFlowService({
      clientConfigs,
      connections,
      states: new MemoryOAuthStateStore(),
    }),
    actions: actionRunner,
    idempotency,
    transitFiles,
    runtimeTokens,
    registerStaticRoutes: staticRoot ? (app) => registerStaticRoutes(app, staticRoot) : undefined,
    auth: {
      ...options.auth,
      hasRuntimeTokens: async () => (await runtimeTokens.listTokens()).length > 0,
      verifyRuntimeToken: (token) => runtimeTokens.verifyToken(token),
    },
    actionPolicy: options.actionPolicy,
    actionSearch: options.actionSearch,
    logger: options.logger,
  });
}

type TestLogEntry = {
  level: "error" | "info" | "warn";
  fields: Record<string, unknown>;
  message: string;
};

function createTestLogger(): { entries: TestLogEntry[]; logger: Logger } {
  const entries: TestLogEntry[] = [];
  const record =
    (level: TestLogEntry["level"]) =>
    (fields: Record<string, unknown>, message: string): void => {
      entries.push({ level, fields, message });
    };

  return {
    entries,
    logger: {
      error: vi.fn(record("error")),
      info: vi.fn(record("info")),
      warn: vi.fn(record("warn")),
    } as unknown as Logger,
  };
}

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "oomol-connect-files-"));
}

async function createTestStaticRoot(): Promise<string> {
  const root = await createTempDir();
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), '<!doctype html><div id="root"></div>');
  await writeFile(join(root, "assets", "console.js"), "console.log('ok');");
  return root;
}

function createTestTransitFiles(rootDir: string, options: { maxBytes?: number } = {}): TransitFileService {
  return new TransitFileService({
    rootDir,
    publicOrigin: "http://localhost:3000",
    ttlSeconds: 60,
    maxBytes: options.maxBytes ?? 1024 * 1024,
  });
}

class EmptyProviderLoader implements IProviderLoader {
  async loadActionExecutor(): Promise<never> {
    throw new Error("No actions are available in this test.");
  }

  async loadProxyExecutor(): Promise<ProviderProxyExecutor | undefined> {
    return undefined;
  }

  async loadCredentialValidators(): Promise<undefined> {
    return undefined;
  }
}

class EchoProviderLoader implements IProviderLoader {
  async loadActionExecutor(): Promise<ActionExecutor> {
    return async (input, context) => {
      await context.getCredential("example");
      return { ok: true, output: input };
    };
  }

  async loadProxyExecutor(): Promise<ProviderProxyExecutor | undefined> {
    return undefined;
  }

  async loadCredentialValidators(): Promise<{
    apiKey(): Promise<{
      profile: {
        accountId: string;
        displayName: string;
        grantedScopes: string[];
      };
    }>;
  }> {
    return {
      async apiKey() {
        return {
          profile: {
            accountId: "example-account",
            displayName: "Example Account",
            grantedScopes: [],
          },
        };
      },
    };
  }
}

class ActionProviderLoader extends EchoProviderLoader {
  private readonly executor: ActionExecutor;

  constructor(executor: ActionExecutor) {
    super();
    this.executor = executor;
  }

  override async loadActionExecutor(): Promise<ActionExecutor> {
    return this.executor;
  }
}

class ProxyProviderLoader extends EchoProviderLoader {
  private readonly proxy?: ProviderProxyExecutor;

  constructor(proxy?: ProviderProxyExecutor) {
    super();
    this.proxy = proxy;
  }

  override async loadProxyExecutor(): Promise<ProviderProxyExecutor> {
    return (
      this.proxy ??
      (async (input, context) => {
        const credential = await context.getCredential("example");
        return {
          ok: true,
          response: {
            status: 202,
            headers: { "content-type": "application/json" },
            data: {
              endpoint: input.endpoint,
              method: input.method,
              query: input.query,
              headers: input.headers,
              body: input.body,
              authType: credential?.authType,
            },
          },
        };
      })
    );
  }
}

class TransitEchoProviderLoader extends EchoProviderLoader {
  override async loadActionExecutor(): Promise<ActionExecutor> {
    return async (_input, context) => {
      await context.getCredential("example");
      const upload = await context.transitFiles?.create(new File(["from executor"], "executor.txt"));
      return { ok: true, output: upload };
    };
  }
}

class MemoryConnectionStore implements IConnectionStore {
  private readonly store = new Map<string, ResolvedCredential>();

  async get(service: string, connectionName: string): Promise<ResolvedCredential | undefined> {
    return this.store.get(createConnectionKey(service, connectionName));
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<void> {
    this.store.set(createConnectionKey(service, connectionName), credential);
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.store.delete(createConnectionKey(service, connectionName));
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.store.entries()].map(([key, credential]) => {
      const [service, connectionName] = key.split(":");
      return {
        service: service!,
        connectionName: connectionName!,
        credential,
      };
    });
  }
}

function createConnectionKey(service: string, connectionName: string): string {
  return `${service}:${connectionName}`;
}

class MemoryOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly configs = new Map<string, OAuthClientConfig>();

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return this.configs.get(service);
  }

  async set(config: OAuthClientConfig): Promise<void> {
    this.configs.set(config.service, config);
  }

  async delete(service: string): Promise<void> {
    this.configs.delete(service);
  }

  async list(): Promise<OAuthClientConfig[]> {
    return [...this.configs.values()];
  }
}

class MemoryOAuthStateStore implements IOAuthStateStore {
  private readonly states = new Map<string, OAuthAuthorizationState>();

  async set(state: OAuthAuthorizationState): Promise<void> {
    this.states.set(state.state, state);
  }

  async take(state: string): Promise<OAuthAuthorizationState | undefined> {
    const value = this.states.get(state);
    this.states.delete(state);
    return value;
  }
}

class MemoryRuntimeTokenStore implements IRuntimeTokenStore {
  private readonly tokens = new Map<string, RuntimeTokenRecord>();

  async add(record: RuntimeTokenRecord): Promise<void> {
    this.tokens.set(record.id, record);
  }

  async list(): Promise<RuntimeTokenRecord[]> {
    return [...this.tokens.values()].sort((left, right) =>
      right.createdAt === left.createdAt
        ? right.id.localeCompare(left.id)
        : right.createdAt.localeCompare(left.createdAt),
    );
  }

  async revoke(id: string): Promise<boolean> {
    return this.tokens.delete(id);
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token) {
      this.tokens.set(id, { ...token, lastUsedAt: usedAt });
    }
  }
}

type MemoryIdempotencyRecord =
  | {
      claimId: string;
      requestHash: string;
      state: "in_progress";
      expiresAt: string;
    }
  | {
      claimId: string;
      requestHash: string;
      state: "completed";
      response: RuntimeActionHttpResult;
      expiresAt: string;
    };

class MemoryIdempotencyStore implements IIdempotencyStore {
  private readonly records = new Map<string, MemoryIdempotencyRecord>();

  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    const current = this.records.get(input.keyHash);
    if (current && current.expiresAt <= input.now) {
      this.records.delete(input.keyHash);
    }

    const record = this.records.get(input.keyHash);
    if (!record) {
      this.records.set(input.keyHash, {
        claimId: input.claimId,
        requestHash: input.requestHash,
        state: "in_progress",
        expiresAt: input.expiresAt,
      });
      return { kind: "acquired" };
    }
    if (record.requestHash !== input.requestHash) {
      return { kind: "conflict" };
    }
    if (record.state === "in_progress") {
      return { kind: "in_progress" };
    }
    return { kind: "completed", response: record.response };
  }

  async complete(input: CompleteIdempotencyInput): Promise<boolean> {
    const record = this.records.get(input.keyHash);
    if (
      !record ||
      record.state !== "in_progress" ||
      record.claimId !== input.claimId ||
      record.requestHash !== input.requestHash
    ) {
      return false;
    }

    this.records.set(input.keyHash, {
      ...record,
      state: "completed",
      response: input.response,
      expiresAt: input.expiresAt,
    });
    return true;
  }
}

class FailingCompleteIdempotencyStore extends MemoryIdempotencyStore {
  override async complete(_input: CompleteIdempotencyInput): Promise<boolean> {
    return false;
  }
}

class MemoryRunLogStore implements IRunLogStore {
  private readonly runs: RunLog[] = [];

  async add(run: RunLog): Promise<void> {
    this.runs.unshift(run);
  }

  async list(input: RunLogListInput = {}): Promise<RunLogPage> {
    const defaultLimit = this.runs.length || 1;
    const limit = Math.max(1, Math.min(input.limit ?? defaultLimit, defaultLimit));
    const cursor = decodeRunLogCursor(input.cursor);
    const filteredRuns = input.service ? this.runs.filter((run) => run.service === input.service) : this.runs;
    const start = cursor
      ? filteredRuns.findIndex((run) => run.startedAt === cursor.startedAt && run.id === cursor.id) + 1
      : 0;
    const runs = filteredRuns.slice(start < 0 ? 0 : start, start + limit + 1);
    const items = runs.slice(0, limit);

    return {
      items,
      nextCursor: runs.length > limit && items.length > 0 ? encodeRunLogCursor(items[items.length - 1]) : undefined,
    };
  }
}

function createRunLog(id: string, startedAt: string): RunLog {
  return {
    id,
    service: "example",
    actionId: "example.echo",
    caller: "web",
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    ok: true,
  };
}
