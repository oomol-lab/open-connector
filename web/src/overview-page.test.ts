import type { ActionDefinition, AppData, ProviderDefinition, RunLog } from "./model";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "./i18n";
import { OverviewPage } from "./overview-page";

describe("OverviewPage", () => {
  it("keeps run details on the runs page instead of the overview", () => {
    const markup = renderOverview();

    expect(markup.match(/class="[^"]*summary-table[^"]*"/g) ?? []).toHaveLength(0);
    expect(markup).not.toContain("overview-recent-runs-panel");
    expect(markup).not.toContain("Recent Runs");
    expect(markup).not.toContain("Recent Failures");
  });

  it("renders recent calls grouped by provider", () => {
    const markup = renderOverview({
      ...overviewData,
      providers: [...overviewData.providers, provider("gmail", "Gmail", [action("gmail.send_email", true)])],
      runs: [
        { ...run("gmail-1", true), service: "gmail", actionId: "mail.send_email" },
        { ...run("gmail-2", true), service: "gmail", actionId: "mail.list_messages" },
      ],
    });

    expect(markup).toContain("overview-recent-calls-panel");
    expect(markup).toContain("Recent Calls");
    expect(markup).toContain("Gmail");
    expect(markup).toContain("2 calls");
    expect(markup).toMatch(/href="\/runs\?service=gmail"/);
  });

  it("limits recent calls to seven providers", () => {
    const providers = Array.from({ length: 8 }, (_, index) =>
      provider(`service${index + 1}`, `Service ${index + 1}`, [action(`service${index + 1}.run`, true)]),
    );
    const runs = providers.map((item, index) => ({
      ...run(`service-${index + 1}`, true),
      service: item.service,
      actionId: `${item.service}.run`,
    }));

    const markup = renderOverview({ ...overviewData, providers, runs });

    expect(markup.match(/class="overview-recent-call-row"/g) ?? []).toHaveLength(7);
    expect(markup).toContain("Service 7");
    expect(markup).not.toContain("Service 8");
  });

  it("renders service call trend without service navigation links", () => {
    const markup = renderOverview({
      ...overviewData,
      providers: [
        ...overviewData.providers,
        provider("gmail", "Gmail", [action("gmail.send_email", true)]),
        provider("slack", "Slack", [action("slack.post_message", true)]),
      ],
      runs: [
        {
          ...run("gmail-1", true),
          service: "gmail",
          actionId: "gmail.send_email",
          startedAt: "2026-07-04T09:00:00.000Z",
        },
        {
          ...run("gmail-2", true),
          service: "gmail",
          actionId: "gmail.send_email",
          startedAt: "2026-07-04T10:00:00.000Z",
        },
        {
          ...run("slack-1", true),
          service: "slack",
          actionId: "slack.post_message",
          startedAt: "2026-07-05T09:00:00.000Z",
        },
      ],
    });

    expect(markup).toContain("overview-call-trend-panel");
    expect(markup).toContain("Tool Call Trend");
    expect(markup).toContain("Gmail");
    expect(markup).toContain("Slack");
    expect(markup).toContain("2 calls");
    expect(markup).toContain("1 call");
    expect(markup).not.toMatch(/<a class="overview-call-trend-legend-row" href=/);
    expect(markup).toMatch(/href="\/runs\?service=gmail"/);
    expect(markup).toMatch(/href="\/runs\?service=slack"/);
  });

  it("renders call trend and recent calls in one overview activity row", () => {
    const markup = renderOverview();

    const activityRow = markup.match(/<section class="content-grid overview-activity-grid">([\s\S]*?)<\/section>/)?.[1];

    expect(activityRow ?? "").toContain("overview-call-trend-panel");
    expect(activityRow ?? "").toContain("overview-recent-calls-panel");
  });

  it("does not render duplicate overview metrics", () => {
    const markup = renderOverview();

    expect(markup.match(/class="[^"]*\bmetric\b[^"]*"/g) ?? []).toHaveLength(0);
    expect(markup).not.toContain("Tokens");
    expect(markup).not.toContain(">Connected<");
    expect(markup).not.toContain("active");
  });

  it("renders capability status as the only full-width overview card", () => {
    const markup = renderOverview();

    expect(markup).toContain("Capability Status");
    expect(markup).not.toContain("Connection Health");
    expect(markup).not.toContain("Common Entries");
    expect(markup.match(/class="[^"]*\boverview-capability-panel\b[^"]*"/g) ?? []).toHaveLength(1);
    expect(markup.match(/class="[^"]*\boverview-health-panel\b[^"]*"/g) ?? []).toHaveLength(0);
  });

  it("renders three capability cell links", () => {
    const markup = renderOverview();

    expect(markup.match(/class="overview-capability-cell"/g) ?? []).toHaveLength(3);
    expect(markup).toMatch(/class="overview-capability-cell" href="\/providers"/);
    expect(markup).toMatch(/class="overview-capability-cell" href="\/actions"/);
    expect(markup).toMatch(/class="overview-capability-cell" href="\/runs"/);
  });

  it("renders provider icons in the provider capability cell", () => {
    const markup = renderOverview();

    expect(markup).toContain("overview-capability-provider-icons");
    expect(markup.match(/class="provider-icon"/g) ?? []).toHaveLength(2);
  });

  it("shows recent run failures as run health attention state", () => {
    const markup = renderOverview();

    expect(markup).toContain("Run Health");
    expect(markup).toContain("Recent failures");
    expect(markup).toContain("Needs attention");
  });

  it("renders overview run history empty states as centered text without icons", () => {
    const markup = renderOverview({ ...overviewData, runs: [] });

    expect(markup.match(/class="empty-state compact no-icon"/g) ?? []).toHaveLength(2);
    expect(markup).not.toContain("No failed runs");
    expect(markup).toContain("No call trend yet");
    expect(markup).toContain("No recent calls");
    expect(markup).not.toContain("No runs yet");
    expect(markup).not.toContain("lucide-circle-check");
    expect(markup).not.toContain("lucide-x");
  });
});

function renderOverview(data: AppData = overviewData): string {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n: createAppI18n("en") },
      createElement(MemoryRouter, {}, createElement(OverviewPage, { data, onRefresh() {} })),
    ),
  );
}

const overviewData: AppData = {
  providers: [
    provider("clock", "Clock", [action("clock.now", true)]),
    provider("github", "GitHub", [action("github.catalog_entry", false)]),
  ],
  connections: [{ service: "github", authType: "oauth2", metadata: {} }],
  oauthConfigs: [],
  runtimeTokens: [],
  runs: [
    run("failed", false),
    run("success-1", true),
    run("success-2", true),
    run("success-3", true),
    run("success-4", true),
    run("success-5", true),
  ],
};

function provider(service: string, displayName: string, actions: ActionDefinition[]): ProviderDefinition {
  return {
    service,
    displayName,
    categories: [],
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions,
  };
}

function action(id: string, locallyExecutable: boolean): ActionDefinition {
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
    service: ok ? "hackernews" : "notion",
    actionId: ok ? "hackernews.get_best_stories" : "notion.append_block",
    caller: "web",
    startedAt: "2026-07-06T09:00:00.000Z",
    completedAt: "2026-07-06T09:00:00.727Z",
    durationMs: 727,
    ok,
    inputSummary: {},
  };
}
