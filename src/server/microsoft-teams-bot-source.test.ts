import type { ConnectApp } from "./connect-app.ts";

import { afterEach, beforeEach, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ActionPolicyService } from "../core/action-policy.ts";
import { provider as microsoftTeamsBot } from "../providers/microsoft_teams_bot/definition.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { createConnectApp } from "./connect-app.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { PlainTextSecretCodec } from "./secrets/secret-codec-core.ts";
import { RuntimeTokenService } from "./storage/runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "./storage/sqlite/runtime-store.ts";

const appId = "00000000-0000-0000-0000-0000000000b0";
let database: SqliteRuntimeDatabase;
let connector: ConnectApp;
let connectionId: string;
let token: string;

beforeEach(async () => {
  database = new SqliteRuntimeDatabase(":memory:");
  const connection = await database.connectionStore.set("microsoft_teams_bot", "bot", {
    authType: "custom_credential",
    values: { appId, clientSecret: "client-secret", tenantId: "tenant-1" },
    profile: { accountId: appId, displayName: `Microsoft Teams Bot ${appId}`, grantedScopes: [] },
    metadata: {},
  });
  connectionId = connection.id;
  token = (
    await new RuntimeTokenService(database.runtimeTokenStore).createToken("Host", {
      allowedActions: [],
      blockedActions: ["*"],
      allowedProxies: [],
      allowedTriggers: ["microsoft_teams_bot.on_activity"],
    })
  ).token;
  connector = await createConnectApp({
    catalog: createCatalogStore([microsoftTeamsBot]),
    // The real executor module, so the Trigger transport is the one production loads.
    providerLoader: new ProviderLoader({
      microsoft_teams_bot: () => import("../providers/microsoft_teams_bot/executors.ts"),
    }),
    runtimeDatabase: database,
    transitFiles: new TransitFileService({
      rootDir: "/unused-teams-source-test",
      publicOrigin: "https://connector.example",
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
    publicOrigin: "https://connector.example",
    secretCodec: new PlainTextSecretCodec(),
    adminToken: "admin",
    runtimeToken: "environment-token",
    actionPolicy: new ActionPolicyService(),
    serveDocumentation: false,
  });
});

afterEach(async () => {
  await connector.triggerMaintenance.close();
  await connector.saasCleanup.close();
  database.close();
});

async function source(request: Record<string, unknown>) {
  const response = await connector.app.request(
    "/v1/providers/microsoft_teams_bot/triggers/microsoft_teams_bot.on_activity/execute",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-oo-connector-app-id": connectionId,
      },
      body: JSON.stringify({ operation: "sourceReference", request: { deploymentId: "deployment", ...request } }),
    },
  );
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

it("creates, reads and deletes a Teams bot Source through the runtime endpoint", async () => {
  const created = await source({ action: "create", requestKey: "teams-bot", input: { eventTypes: ["message"] } });
  expect(created.status).toBe(200);
  const reference = created.body.data.source.reference;
  expect(created.body.data.source).toMatchObject({
    eventTypes: ["message"],
    ready: true,
    view: { appId, signingSecretConfigured: false, verifiedAt: null },
  });
  expect(await source({ action: "create", requestKey: "teams-bot", input: { eventTypes: ["message"] } })).toEqual(
    created,
  );
  expect((await source({ action: "get", reference })).body.data.source).toMatchObject({ reference, ready: true });
  expect((await source({ action: "delete", reference })).body.data).toEqual({ deleted: true });
});
