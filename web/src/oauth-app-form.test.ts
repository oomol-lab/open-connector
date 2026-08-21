import type { AuthDefinition, ProviderDefinition } from "./model";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import { OAuthAppForm } from "./oauth-app-form";

const setupAuth: Extract<AuthDefinition, { type: "oauth2" }> = {
  type: "oauth2",
  scopes: [],
  clientSetup: {
    docsUrl: "https://provider.example/developers",
    steps: ["Create the application.", "Enable every scope the runtime requests."],
  },
};

const bareAuth: Extract<AuthDefinition, { type: "oauth2" }> = { type: "oauth2", scopes: [] };

function provider(auth: AuthDefinition): ProviderDefinition {
  return {
    service: "example",
    displayName: "Example",
    categories: [],
    authTypes: ["oauth2"],
    auth: [auth],
    actions: [],
  };
}

function markupFor(auth: Extract<AuthDefinition, { type: "oauth2" }>): string {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n: createAppI18n("en") },
      createElement(OAuthAppForm, { provider: provider(auth), auth, onRefresh: vi.fn() }),
    ),
  );
}

describe("OAuthAppForm", () => {
  it("walks the user through registering the provider OAuth app", () => {
    const markup = markupFor(setupAuth);

    expect(markup).toContain("Create the OAuth app");
    expect(markup).toContain("Create the application.");
  });

  it("links out to the provider's app registration from the steps", () => {
    const markup = markupFor(setupAuth);

    expect(markup).toContain('href="https://provider.example/developers"');
    expect(markup).toContain("Open Example developer portal");
  });

  it("omits the steps for a provider that documents no setup", () => {
    const markup = markupFor(bareAuth);

    expect(markup).not.toContain("Create the OAuth app");
    expect(markup).toContain("Client ID");
  });
});
