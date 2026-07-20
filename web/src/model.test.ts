import type { AppData, ProviderDefinition, RunLog } from "./model";

import { describe, expect, it } from "vitest";
import { createOverviewSummary, resolveProviderConnectionStatus, sortProviders } from "./model";

function provider(service: string, displayName: string): ProviderDefinition {
  return {
    service,
    displayName,
    categories: [],
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions: [],
  };
}

function oauthProvider(service: string, displayName: string): ProviderDefinition {
  return {
    service,
    displayName,
    categories: [],
    authTypes: ["oauth2"],
    auth: [{ type: "oauth2", scopes: [] }],
    actions: [],
  };
}

function action(id: string, locallyExecutable: boolean): ProviderDefinition["actions"][number] {
  return {
    id,
    service: id.split(".")[0] ?? "service",
    name: id,
    description: "",
    requiredScopes: [],
    inputSchema: {},
    outputSchema: {},
    execution: {
      locallyExecutable,
      catalogOnly: !locallyExecutable,
      requiredAuthTypes: [],
      noAuthRunnable: true,
      needsCredential: false,
    },
  };
}

function run(id: string, ok: boolean): RunLog {
  return {
    id,
    service: "clock",
    actionId: "clock.now",
    caller: "web",
    startedAt: "2026-07-06T09:00:00.000Z",
    completedAt: "2026-07-06T09:00:00.727Z",
    durationMs: 727,
    ok,
  };
}

describe("sortProviders", () => {
  it("places connected providers before pinned, recommended, and display-name ordering", () => {
    const providers = [
      provider("airtable", "Airtable"),
      provider("fusion-api", "OOMOL Fusion API"),
      provider("github", "GitHub"),
      provider("zendesk", "Zendesk"),
    ];
    const connections = new Map([
      ["github", { service: "github", authType: "no_auth", virtual: true, metadata: {} }],
      ["zendesk", { service: "zendesk", authType: "oauth2", metadata: {} }],
    ]);

    expect(sortProviders(providers, connections).map((item) => item.service)).toEqual([
      "zendesk",
      "fusion-api",
      "github",
      "airtable",
    ]);
  });

  it("places common providers before alphabetical fallback providers", () => {
    const providers = [
      provider("ably", "Ably"),
      provider("discord", "Discord"),
      provider("google_search_console", "Google Search Console"),
      provider("gmail", "Gmail"),
      provider("github", "GitHub"),
      provider("googlesheets", "Google Sheets"),
      provider("google_bigquery", "Google BigQuery"),
    ];

    expect(sortProviders(providers, new Map()).map((item) => item.service)).toEqual([
      "googlesheets",
      "gmail",
      "github",
      "discord",
      "google_search_console",
      "google_bigquery",
      "ably",
    ]);
  });
});

describe("createOverviewSummary", () => {
  it("counts locally executable actions", () => {
    const clock = {
      ...provider("clock", "Clock"),
      actions: [action("clock.now", true), action("clock.catalog_only", false)],
    };
    const github = {
      ...oauthProvider("github", "GitHub"),
      actions: [action("github.create_issue", true)],
    };

    expect(createOverviewSummary({ ...emptyAppData, providers: [clock, github] })).toMatchObject({
      actionCount: 3,
      locallyExecutableActionCount: 2,
    });
  });

  it("does not count virtual no-auth connections as connected providers", () => {
    expect(
      createOverviewSummary({
        ...emptyAppData,
        connections: [
          { service: "clock", authType: "no_auth", virtual: true, metadata: {} },
          { service: "github", authType: "oauth2", configured: true, metadata: {} },
        ],
      }).connectedCount,
    ).toBe(1);
  });

  it("counts all failed runs while keeping the display list capped", () => {
    const runs = [
      run("failed-1", false),
      run("failed-2", false),
      run("failed-3", false),
      run("failed-4", false),
      run("failed-5", false),
      run("failed-6", false),
      run("success", true),
    ];

    const summary = createOverviewSummary({ ...emptyAppData, runs });

    expect(summary.failedRunCount).toBe(6);
    expect(summary.failedRuns).toHaveLength(5);
  });
});

describe("resolveProviderConnectionStatus", () => {
  it("treats no-auth-only providers as no-setup instead of connected", () => {
    const status = resolveProviderConnectionStatus(
      provider("clock", "Clock"),
      [{ service: "clock", authType: "no_auth", virtual: true, metadata: {} }],
      [],
    );

    expect(status).toMatchObject({
      noSetupRequired: true,
      connected: false,
      oauthClientRequired: false,
    });
    expect(status.connection).toBeUndefined();
  });

  it("uses non-no-auth connections as configured credentials", () => {
    const status = resolveProviderConnectionStatus(
      oauthProvider("gmail", "Gmail"),
      [{ service: "gmail", authType: "oauth2", configured: true, metadata: {} }],
      [{ service: "gmail", configured: true, clientId: "gmail-client-id" }],
    );

    expect(status).toMatchObject({
      noSetupRequired: false,
      connected: true,
      oauthClientRequired: false,
    });
    expect(status.connection?.authType).toBe("oauth2");
  });

  it("does not show an OAuth client warning alongside a usable API-key connection", () => {
    const status = resolveProviderConnectionStatus(
      {
        ...oauthProvider("notion", "Notion"),
        authTypes: ["api_key", "oauth2"],
        auth: [{ type: "api_key" }, { type: "oauth2", scopes: [] }],
      },
      [{ service: "notion", authType: "api_key", metadata: {} }],
      [],
    );

    expect(status).toMatchObject({
      connected: true,
      oauthClientRequired: false,
    });
  });

  it("keeps the OAuth client warning for an unconfigured OAuth-only provider", () => {
    const status = resolveProviderConnectionStatus(oauthProvider("gmail", "Gmail"), [], []);

    expect(status).toMatchObject({
      connected: false,
      oauthClientRequired: true,
    });
  });

  it("prefers a default credential connection when multiple records exist", () => {
    const status = resolveProviderConnectionStatus(
      oauthProvider("slack", "Slack"),
      [
        { service: "slack", authType: "oauth2", metadata: {}, default: false },
        { service: "slack", authType: "api_key", metadata: {}, default: true },
      ],
      [{ service: "slack", configured: true, clientId: "slack-client-id" }],
    );

    expect(status.connection?.authType).toBe("api_key");
    expect(status.connections).toHaveLength(2);
  });

  it("excludes virtual, no-auth, and explicitly unconfigured records", () => {
    const status = resolveProviderConnectionStatus(
      oauthProvider("slack", "Slack"),
      [
        { service: "slack", connectionName: "work", authType: "oauth2", metadata: {} },
        { service: "slack", connectionName: "virtual", authType: "oauth2", virtual: true, metadata: {} },
        { service: "slack", connectionName: "disabled", authType: "oauth2", configured: false, metadata: {} },
        { service: "slack", connectionName: "anonymous", authType: "no_auth", metadata: {} },
      ],
      [{ service: "slack", configured: true, clientId: "slack-client-id" }],
    );

    expect(status.connections.map((connection) => connection.connectionName)).toEqual(["work"]);
  });
});

const emptyAppData: AppData = {
  providers: [],
  connections: [],
  oauthConfigs: [],
  runtimeTokens: [],
  runs: [],
};
