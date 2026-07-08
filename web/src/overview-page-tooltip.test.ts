import type { ReactNode } from "react";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";

vi.mock("recharts", async () => {
  const React = await import("react");

  function Container(props: { children?: ReactNode }): ReactNode {
    return React.createElement("div", null, props.children);
  }

  function Leaf(): ReactNode {
    return React.createElement("div");
  }

  function Bar(props: { barSize?: number; stackId?: string }): ReactNode {
    return React.createElement("div", {
      "data-chart-bar-size": String(props.barSize),
      "data-chart-bar-stack": String(props.stackId),
    });
  }

  function Tooltip(props: { isAnimationActive?: boolean; shared?: boolean; useTranslate3d?: boolean }): ReactNode {
    return React.createElement("div", {
      "data-chart-tooltip-animation": String(props.isAnimationActive),
      "data-chart-tooltip-shared": String(props.shared),
      "data-chart-tooltip-translate3d": String(props.useTranslate3d),
    });
  }

  return {
    Bar,
    BarChart: Container,
    CartesianGrid: Leaf,
    ResponsiveContainer: Container,
    Tooltip,
    XAxis: Leaf,
    YAxis: Leaf,
  };
});

describe("OverviewPage chart tooltip", () => {
  it("disables tooltip fly-in animation while keeping transform positioning", async () => {
    const { OverviewPage } = await import("./overview-page");
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(
          MemoryRouter,
          {},
          createElement(OverviewPage, {
            data: {
              providers: [
                {
                  service: "gmail",
                  displayName: "Gmail",
                  categories: [],
                  authTypes: ["no_auth"],
                  auth: [{ type: "no_auth" }],
                  actions: [],
                },
              ],
              connections: [],
              oauthConfigs: [],
              runtimeTokens: [],
              runs: [
                {
                  id: "run-1",
                  service: "gmail",
                  actionId: "gmail.send_email",
                  caller: "web",
                  startedAt: "2026-07-04T09:00:00.000Z",
                  completedAt: "2026-07-04T09:00:00.200Z",
                  durationMs: 200,
                  ok: true,
                  inputSummary: {},
                },
              ],
            },
            onRefresh() {},
          }),
        ),
      ),
    );

    expect(markup).toContain('data-chart-tooltip-animation="false"');
    expect(markup).toContain('data-chart-tooltip-translate3d="true"');
  });

  it("uses stacked bars and axis hover so trend points are easy to target", async () => {
    const { OverviewPage } = await import("./overview-page");
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(
          MemoryRouter,
          {},
          createElement(OverviewPage, {
            data: {
              providers: [
                {
                  service: "gmail",
                  displayName: "Gmail",
                  categories: [],
                  authTypes: ["no_auth"],
                  auth: [{ type: "no_auth" }],
                  actions: [],
                },
              ],
              connections: [],
              oauthConfigs: [],
              runtimeTokens: [],
              runs: [
                {
                  id: "run-1",
                  service: "gmail",
                  actionId: "gmail.send_email",
                  caller: "web",
                  startedAt: "2026-07-04T09:00:00.000Z",
                  completedAt: "2026-07-04T09:00:00.200Z",
                  durationMs: 200,
                  ok: true,
                  inputSummary: {},
                },
              ],
            },
            onRefresh() {},
          }),
        ),
      ),
    );

    expect(markup).toContain('data-chart-bar-size="12"');
    expect(markup).toContain('data-chart-bar-stack="calls"');
    expect(markup).toContain('data-chart-tooltip-shared="undefined"');
  });
});
