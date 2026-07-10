import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import { ResourcesPage } from "./resources-page";

describe("ResourcesPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders a copyable MCP client configuration", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:4321" } });

    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(MemoryRouter, {}, createElement(ResourcesPage)),
      ),
    );

    expect(markup).toContain("http://localhost:4321/mcp");
    expect(markup).toContain("mcpServers");
    expect(markup).toContain("open-connector");
    expect(markup).not.toContain("oomol-connect");
    expect(markup).toContain("Bearer &lt;RUNTIME_TOKEN&gt;");
    expect(markup).toContain("Copy MCP URL");
    expect(markup).toContain("Copy JSON configuration");
    expect(markup).toMatch(/href="\/access"/);
    expect(markup).not.toMatch(/href="\/mcp\/tools"/);
  });
});
