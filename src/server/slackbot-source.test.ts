import type { ConnectApp } from "./connect-app.ts";

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ActionPolicyService } from "../core/action-policy.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { provider as slackbot } from "../providers/slackbot/definition.ts";
import { createConnectApp } from "./connect-app.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { PlainTextSecretCodec } from "./secrets/secret-codec-core.ts";
import { RuntimeTokenService } from "./storage/runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "./storage/sqlite/runtime-store.ts";

const signingSecret = "slack-signing-secret";
const input = { appId: "A0APP", workspaceId: "T0TEAM", signingSecret, eventTypes: ["app_mention", "block_actions"] };
let database: SqliteRuntimeDatabase;
let connector: ConnectApp;
let connectionId: string;
let token: string;
let slackCalls: string[];

beforeEach(async () => {
  database = new SqliteRuntimeDatabase(":memory:");
  slackCalls = [];
  // Source operations need no Slack Web API call; any request reaching Slack fails the test.
  vi.stubGlobal("fetch", async (url: string | URL | Request) => {
    slackCalls.push(String(url instanceof Request ? url.url : url));
    return Response.json({ ok: false, error: "unexpected_request" }, { status: 500 });
  });
  const connection = await database.connectionStore.set("slackbot", "workspace", {
    authType: "oauth2",
    accessToken: "xoxb-bot-token",
    tokenType: "Bearer",
    profile: { accountId: "U0BOT", displayName: "Bot", grantedScopes: ["app_mentions:read", "im:history"] },
    metadata: { rawTokenType: "bot" },
  });
  connectionId = connection.id;
  token = (
    await new RuntimeTokenService(database.runtimeTokenStore).createToken("Host", {
      allowedActions: [],
      blockedActions: ["*"],
      allowedProxies: [],
      allowedTriggers: ["slackbot.on_event"],
    })
  ).token;
  connector = await createConnectApp({
    catalog: createCatalogStore([slackbot]),
    // The real executor module, so the Trigger transport is the one production loads.
    providerLoader: new ProviderLoader({ slackbot: () => import("../providers/slackbot/executors.ts") }),
    runtimeDatabase: database,
    transitFiles: new TransitFileService({
      rootDir: "/unused-slackbot-source-test",
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
  vi.unstubAllGlobals();
});

async function source(request: Record<string, unknown>) {
  const response = await connector.app.request("/v1/providers/slackbot/triggers/slackbot.on_event/execute", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-oo-connector-app-id": connectionId,
    },
    body: JSON.stringify({ operation: "sourceReference", request: { deploymentId: "deployment", ...request } }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

function signed(body: string, contentType: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    rawBody: Buffer.from(body).toString("base64"),
    headers: {
      "content-type": contentType,
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
    },
  };
}

it("runs the slackbot Source lifecycle with a bot-token connection", async () => {
  const created = await source({ action: "create", requestKey: "workspace-row", input });
  expect(created.status).toBe(200);
  const { reference, revision } = created.body.data.source;
  expect(created.body.data.source).toMatchObject({
    eventTypes: input.eventTypes,
    ready: false,
    view: { appId: "A0APP", workspaceId: "T0TEAM", signingSecretConfigured: true },
  });
  expect(JSON.stringify(created.body)).not.toContain(signingSecret);

  // Retrying the same create returns the same Source; changing its input under that key is refused.
  expect(await source({ action: "create", requestKey: "workspace-row", input })).toEqual(created);
  const changed = await source({
    action: "create",
    requestKey: "workspace-row",
    input: { ...input, eventTypes: ["message.im"] },
  });
  expect(changed.status).toBe(409);
  expect(changed.body).toMatchObject({ errorCode: "invalid_input" });

  // Slack's url_verification arrives on the application route and marks the Source ready.
  const challenge = await source({
    action: "route",
    applicationId: reference.applicationId,
    ...signed(JSON.stringify({ type: "url_verification", challenge: "challenge-value" }), "application/json"),
  });
  expect(challenge.body.data).toEqual({
    references: [],
    response: { status: 200, body: '{"challenge":"challenge-value"}', headers: { "content-type": "application/json" } },
  });
  expect((await source({ action: "get", reference })).body.data.source).toMatchObject({ reference, ready: true });

  const click = new URLSearchParams({
    payload: JSON.stringify({
      type: "block_actions",
      trigger_id: "13345224609.738474920.8088930838d88f008e0",
      api_app_id: "A0APP",
      team: { id: "T0TEAM" },
      user: { id: "U0APPROVER" },
      channel: { id: "C0CHAN" },
      message: { ts: "1700000000.000100" },
      actions: [{ type: "button", action_id: "approve", block_id: "decision", value: "approved" }],
    }),
  }).toString();
  const delivery = signed(click, "application/x-www-form-urlencoded");
  expect(
    (await source({ action: "route", applicationId: reference.applicationId, ...delivery })).body.data,
  ).toMatchObject({ references: [reference] });
  const received = await source({
    action: "receive",
    reference,
    consumers: [{ id: "approvals", config: { eventTypes: ["block_actions"] } }],
    ...delivery,
  });
  expect(received.body.data.event).toMatchObject({
    id: "13345224609.738474920.8088930838d88f008e0",
    type: "block_actions",
    matches: ["approvals"],
    payload: { user: "U0APPROVER", channel: "C0CHAN", actions: [{ actionId: "approve", value: "approved" }] },
  });

  const updated = await source({
    action: "update",
    reference,
    expectedRevision: (await source({ action: "get", reference })).body.data.source.revision,
    input: { eventTypes: ["app_mention", "block_actions", "view_submission"] },
  });
  expect(updated.status).toBe(200);
  expect(updated.body.data.source).toMatchObject({
    eventTypes: ["app_mention", "block_actions", "view_submission"],
    ready: true,
  });
  expect(updated.body.data.source.revision).toBeGreaterThan(revision);

  expect((await source({ action: "delete", reference })).body.data).toEqual({ deleted: true });
  expect((await source({ action: "get", reference })).body).toMatchObject({ errorCode: "trigger_not_found" });
  expect(slackCalls).toEqual([]);
});

it("names the missing Source input field", async () => {
  const { workspaceId: _workspaceId, ...incomplete } = input;
  const response = await source({ action: "create", requestKey: "incomplete", input: incomplete });
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ errorCode: "invalid_input" });
  expect(response.body.message).toContain("workspaceId");
  expect(response.body.message).not.toContain(signingSecret);
});
