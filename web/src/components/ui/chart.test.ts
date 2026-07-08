import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartTooltipContent } from "./chart";

describe("ChartTooltipContent", () => {
  it("renders the hovered chart label and series value", () => {
    const markup = renderToStaticMarkup(
      createElement(ChartTooltipContent, {
        active: true,
        label: "07/04",
        config: {
          gmail: { label: "Gmail", color: "var(--chart-1)" },
        },
        payload: [
          {
            dataKey: "gmail",
            name: "gmail",
            value: 2,
            color: "var(--chart-1)",
          },
        ],
        valueFormatter: (value) => `${value} calls`,
      }),
    );

    expect(markup).toContain("07/04");
    expect(markup).toContain("Gmail");
    expect(markup).toContain("2 calls");
  });

  it("can hide zero-value tooltip rows", () => {
    const markup = renderToStaticMarkup(
      createElement(ChartTooltipContent, {
        active: true,
        label: "07/04",
        config: {
          gmail: { label: "Gmail", color: "var(--chart-1)" },
          slack: { label: "Slack", color: "var(--chart-3)" },
        },
        hideZero: true,
        payload: [
          {
            dataKey: "gmail",
            name: "gmail",
            value: 2,
            color: "var(--chart-1)",
          },
          {
            dataKey: "slack",
            name: "slack",
            value: 0,
            color: "var(--chart-3)",
          },
        ],
        valueFormatter: (value) => `${value} calls`,
      }),
    );

    expect(markup).toContain("Gmail");
    expect(markup).not.toContain("Slack");
  });
});
