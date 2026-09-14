import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import { defaultMarketplaceDiscoveryUrl, isDefaultMarketplace } from "../../src/marketplace/default-marketplace";
import { createAppI18n } from "./i18n";
import { MarketplacePage } from "./marketplace-page";
import { emptyData } from "./model";

it("normalizes the default URL without trusting lookalike hosts or altered queries", () => {
  expect(isDefaultMarketplace(defaultMarketplaceDiscoveryUrl)).toBe(true);
  expect(isDefaultMarketplace(" https://CONNECTOR.OOMOL.COM:443/.well-known/oomol-connector-marketplace/ ")).toBe(true);
  for (const url of [
    "",
    "not a URL",
    defaultMarketplaceDiscoveryUrl + "?source=custom",
    defaultMarketplaceDiscoveryUrl + "#custom",
    "https://connector.oomol.com.evil.example/.well-known/oomol-connector-marketplace",
    "https://custom.example/discovery",
  ]) {
    expect(isDefaultMarketplace(url)).toBe(false);
  }
});

it("shows default branding before connection but not for custom sources with the same name", () => {
  function render(discoveryUrl: string, configured: boolean): string {
    const data = {
      ...emptyData,
      marketplace: {
        configured,
        enabled: configured,
        discoveryUrl,
        status: "disabled" as const,
        compatibleActionCount: 0,
        compatibleProviderCount: 0,
        marketplace: { version: 1 as const, id: "oomol", name: "OOMOL Marketplace", pricing: "metered" as const },
      },
    };
    return renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(MemoryRouter, null, createElement(MarketplacePage, { data, onRefresh() {} })),
      ),
    );
  }
  const defaultMarkup = render(defaultMarketplaceDiscoveryUrl, false);
  expect(defaultMarkup).toContain("Official apps");
  expect(defaultMarkup).toContain("https://console.oomol.com/api-key");
  const customMarkup = render("https://custom.example/discovery", true);
  expect(customMarkup).toContain("OOMOL Marketplace");
  expect(customMarkup).not.toContain("Official apps");
  expect(customMarkup).not.toContain("https://console.oomol.com/api-key");
  expect(customMarkup).not.toContain("30% off");
});
