import type { AppData, ProviderDefinition } from "./model";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import { OAuthAppsPage } from "./oauth-apps-page";

const oauthProvider: ProviderDefinition = {
  service: "github",
  displayName: "GitHub",
  categories: [],
  authTypes: ["oauth2"],
  auth: [{ type: "oauth2", scopes: [] }],
  actions: [],
};

const apiKeyProvider: ProviderDefinition = {
  service: "stripe",
  displayName: "Stripe",
  categories: [],
  authTypes: ["api_key"],
  auth: [{ type: "api_key" }],
  actions: [],
};

describe("OAuthAppsPage", () => {
  it("lists OAuth providers with their default app status", () => {
    const data: AppData = {
      providers: [oauthProvider, apiKeyProvider],
      connections: [],
      oauthConfigs: [
        {
          service: "github",
          configured: true,
          clientId: "github-client-id",
          expectedRedirectUri: "http://localhost:3000/oauth/callback",
        },
      ],
      runtimeTokens: [],
      runs: [],
    };

    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(OAuthAppsPage, { data, onRefresh: vi.fn() }),
      ),
    );

    expect(markup).toContain("Default OAuth Apps");
    expect(markup).toContain("GitHub");
    expect(markup).toContain("github-client-id");
    expect(markup).toContain("Configured");
    expect(markup).toContain("Edit");
    expect(markup).not.toContain("Stripe");
  });
});
