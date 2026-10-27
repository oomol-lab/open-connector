import type { CreateHarness } from "../../contracts/triggers/conformance.ts";
import type { ProviderProxyExecutor } from "../core/types.ts";

import { createCatalogStore } from "../catalog-store.ts";
import { ActionPolicyService } from "../core/action-policy.ts";
import { provider as asana } from "../providers/asana/definition.ts";
import { provider as feishuAppBot } from "../providers/feishu_app_bot/definition.ts";
import { provider as fireflies } from "../providers/fireflies/definition.ts";
import { provider as github } from "../providers/github/definition.ts";
import { provider as intercom } from "../providers/intercom/definition.ts";
import { provider as jira } from "../providers/jira/definition.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { provider as sentry } from "../providers/sentry/definition.ts";
import { provider as slackbot } from "../providers/slackbot/definition.ts";
import { provider as tally } from "../providers/tally/definition.ts";
import { provider as zoom } from "../providers/zoom/definition.ts";
import { createConnectApp } from "./connect-app.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { PlainTextSecretCodec } from "./secrets/secret-codec-core.ts";
import { RuntimeTokenService } from "./storage/runtime-token-service.ts";
import { SqliteRuntimeDatabase } from "./storage/sqlite/runtime-store.ts";

export const createHarness: CreateHarness = async (upstream) => {
  const database = new SqliteRuntimeDatabase(":memory:");
  const connections = new Map<string, string>();
  for (const service of [
    "github",
    "tally",
    "slackbot",
    "asana",
    "feishu_app_bot",
    "fireflies",
    "intercom",
    "jira",
    "sentry",
    "zoom",
  ]) {
    const connection = await database.connectionStore.set(service, "contract", {
      authType: service === "jira" ? "oauth2" : "api_key",
      accessToken: "contract-token",
      tokenType: "Bearer",
      apiKey: "contract-key",
      values: { apiKey: "contract-key" },
      profile: {
        accountId:
          (
            {
              feishu_app_bot: "cli_test",
              fireflies: "fireflies-user",
              intercom: "workspace:admin",
              jira: "jira:cloud:user",
              sentry: "organization",
              zoom: "zoom-user",
            } as Record<string, string>
          )[service] ?? (service === "slackbot" ? "U123" : "contract-account"),
        displayName: "Contract",
        grantedScopes: ["repo", "user:read:user", "cloud_recording:read:recording"],
      },
      metadata: {
        providerAccountVerified: true,
        oauthClientConfig: { clientId: "contract", clientSecret: "contract-secret" },
      },
    });
    connections.set(service, connection.id);
  }
  const runtime = await new RuntimeTokenService(database.runtimeTokenStore).createToken("Trigger conformance", {
    allowedActions: [],
    blockedActions: [],
    allowedProxies: [],
    allowedTriggers: [
      "asana.on_task_event",
      "feishu_app_bot.on_event",
      "fireflies.on_meeting_ready",
      "intercom.on_conversation_event",
      "jira.on_issue_event",
      "sentry.on_issue_alert",
      "zoom.on_recording_ready",

      "github.watch_pull_request",
      "tally.on_form_response",
      "slackbot.on_event",
    ],
  });
  const otherRuntime = await new RuntimeTokenService(database.runtimeTokenStore).createToken("Other Source owner", {
    allowedActions: [],
    blockedActions: [],
    allowedProxies: [],
    allowedTriggers: ["slackbot.on_event"],
  });
  const proxy =
    (service: string): ProviderProxyExecutor =>
    async (request) => ({
      ok: true,
      response: { ...(await upstream(service, request)), headers: {} },
    });
  const connector = await createConnectApp({
    catalog: createCatalogStore([
      asana,
      github,
      tally,
      slackbot,
      feishuAppBot,
      fireflies,
      intercom,
      jira,
      sentry,
      zoom,
    ]),
    providerLoader: new ProviderLoader({
      feishu_app_bot: async () => ({
        ...(await import("../providers/feishu_app_bot/executors.ts")),
        proxy: proxy("feishu_app_bot"),
      }),
      fireflies: async () => ({ ...(await import("../providers/fireflies/executors.ts")), proxy: proxy("fireflies") }),
      intercom: async () => ({ ...(await import("../providers/intercom/executors.ts")), proxy: proxy("intercom") }),
      jira: async () => ({ ...(await import("../providers/jira/executors.ts")), proxy: proxy("jira") }),
      sentry: async () => ({ ...(await import("../providers/sentry/executors.ts")), proxy: proxy("sentry") }),
      zoom: async () => ({ ...(await import("../providers/zoom/executors.ts")), proxy: proxy("zoom") }),
      asana: async () => ({ ...(await import("../providers/asana/executors.ts")), proxy: proxy("asana") }),
      slackbot: async () => ({ ...(await import("../providers/slackbot/executors.ts")), proxy: proxy("slackbot") }),
      github: async () => ({ ...(await import("../providers/github/executors.ts")), proxy: proxy("github") }),
      tally: async () => ({ ...(await import("../providers/tally/executors.ts")), proxy: proxy("tally") }),
    }),
    runtimeDatabase: database,
    transitFiles: new TransitFileService({
      rootDir: "/unused-trigger-conformance",
      publicOrigin: "https://connector.example",
      ttlSeconds: 60,
      maxBytes: 1024,
    }),
    publicOrigin: "https://connector.example",
    secretCodec: new PlainTextSecretCodec(),
    adminToken: "contract-admin",
    actionPolicy: new ActionPolicyService(),
    serveDocumentation: false,
  });
  return {
    async request(triggerId, body, owner) {
      const service = triggerId.split(".")[0]!;
      return connector.app.request(`/v1/providers/${service}/triggers/${triggerId}/execute`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${owner === "other" ? otherRuntime.token : runtime.token}`,
          "content-type": "application/json",
          "x-oo-connector-app-id": connections.get(service)!,
        },
        body: JSON.stringify(body),
      });
    },
    async disconnect() {
      await database.connectionStore.delete("slackbot", "contract");
    },
    async close() {
      await connector.triggerMaintenance.close();
      await connector.saasCleanup.close();
      database.close();
    },
  };
};
