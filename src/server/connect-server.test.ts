import type { IConnectionStore, StoredConnection } from "../connection-service.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { ActionSearchIndexProvider } from "../core/action-search.ts";
import type { ActionDefinition, ActionExecutor, ProviderDefinition, ResolvedCredential } from "../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { IRunLogStore, RunLog, RunLogListInput, RunLogPage } from "./storage/runtime-store.ts";
import type { IRuntimeTokenStore, RuntimeTokenRecord } from "./storage/runtime-token-service.ts";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { ActionPolicyService as LocalActionPolicyService } from "../core/action-policy.ts";
import { buildActionSearchIndex } from "../core/action-search.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
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

describe("ConnectServer", () => {
  it("serves catalog and standard connection errors without opening a port", async () => {
    const app = createTestServer([apiKeyProvider]).createApp();

    const catalogResponse = await app.request("/api/providers/example");
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
    const app = createTestServer([apiKeyProvider]).createApp();

    const response = await app.request("/v1/does-not-exist");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Not found.",
      },
    });
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

  it("keeps the console shell public while protecting admin APIs", async () => {
    const staticRoot = await createTestStaticRoot();
    try {
      const app = createTestServer([apiKeyProvider], {
        staticRoot,
        auth: { adminToken: "local-token" },
      }).createApp();

      expect((await app.request("/overview")).status).toBe(200);
      expect((await app.request("/assets/console.js")).status).toBe(200);
      expect((await app.request("/api/providers")).status).toBe(401);
      expect((await app.request("/docs")).status).toBe(401);

      const authorized = await app.request("/api/providers", {
        headers: { authorization: "Bearer local-token" },
      });
      expect(authorized.status).toBe(200);
      expect(authorized.headers.get("set-cookie")).toContain("oomol_connect_admin_token=");
    } finally {
      await rm(staticRoot, { recursive: true, force: true });
    }
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

    const revokedUnauthorized = await app.request("/v1/actions", {
      headers: { authorization: `Bearer ${createdBody.token}` },
    });
    expect(revokedUnauthorized.status).toBe(401);
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

    const providers = await app.request("/v1/providers");
    expect(providers.status).toBe(200);
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
    await expect(actionServices.json()).resolves.toMatchObject({
      success: true,
      data: [{ service: "example" }],
    });

    const actions = await app.request("/v1/actions?service=example");
    expect(actions.status).toBe(200);
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
    const apiSearchResults = (await apiSearch.json()) as Array<{
      id: string;
      service: string;
      name: string;
      inputSchema: Record<string, unknown>;
      outputSchema: Record<string, unknown>;
    }>;
    expect(apiSearchResults[0]).toMatchObject({
      id: "example.echo",
      service: "example",
      name: "echo",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    });

    const runtimeSearch = await app.request("/v1/actions/search?q=echo");
    expect(runtimeSearch.status).toBe(200);
    const runtimeSearchBody = (await runtimeSearch.json()) as {
      success: boolean;
      data: Array<{
        id: string;
        service: string;
        name: string;
        description: string;
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
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    });

    const action = await app.request("/v1/actions/example.echo");
    expect(action.status).toBe(200);
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
    expect(apiResults[0]?.inputSchema).toEqual({ type: "object" });

    const runtimeSearch = await app.request("/v1/actions/search?q=echo");
    expect(runtimeSearch.status).toBe(200);
    const runtimeBody = (await runtimeSearch.json()) as {
      success: boolean;
      data: Array<{ id: string; outputSchema: Record<string, unknown> }>;
    };
    expect(runtimeBody.success).toBe(true);
    expect(runtimeBody.data.map((result) => result.id)).toEqual(["example.echo"]);
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
});

interface CreateTestServerOptions {
  auth?: { adminToken?: string; runtimeToken?: string };
  actionPolicy?: ActionPolicyService;
  actionSearch?: ActionSearchIndexProvider;
  providerLoader?: IProviderLoader;
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
  });
  const staticRoot = options.staticRoot === false ? undefined : (options.staticRoot ?? ".tmp/test-static");

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
  });
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
  async set(_state: OAuthAuthorizationState): Promise<void> {}

  async take(_state: string): Promise<OAuthAuthorizationState | undefined> {
    return undefined;
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

  async revoke(id: string, revokedAt: string): Promise<boolean> {
    const token = this.tokens.get(id);
    if (!token || token.revokedAt) {
      return false;
    }

    this.tokens.set(id, { ...token, revokedAt });
    return true;
  }

  async markUsed(id: string, usedAt: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token && !token.revokedAt) {
      this.tokens.set(id, { ...token, lastUsedAt: usedAt });
    }
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
    const start = cursor
      ? this.runs.findIndex((run) => run.startedAt === cursor.startedAt && run.id === cursor.id) + 1
      : 0;
    const runs = this.runs.slice(start < 0 ? 0 : start, start + limit + 1);
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
    actionId: "example.echo",
    caller: "web",
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    ok: true,
  };
}
