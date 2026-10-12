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

describe("OAuthAppForm client secret", () => {
  const secretField = { key: "clientSecret", label: "Client secret", inputType: "password" as const, secret: true };

  it("requires the secret for a confidential client", () => {
    const markup = markupFor({ ...bareAuth, clientFields: [{ ...secretField, required: true }] });

    expect(markup).toContain("Client Secret");
    expect(markup).not.toContain("Client Secret (optional)");
    expect(markup).toMatch(/type="password"[^>]*required=""/);
  });

  it("offers an optional secret, and says a blank save keeps the stored one, where the provider allows a public client", () => {
    const markup = markupFor({
      ...bareAuth,
      clientSecretOptional: true,
      clientFields: [{ ...secretField, required: false }],
    });

    expect(markup).toContain("Client Secret (optional)");
    expect(markup).toContain("Leave blank to keep the stored secret");
    expect(markup).not.toMatch(/type="password"[^>]*required=""/);
  });

  it("shows no secret field for a provider that never takes one", () => {
    const markup = markupFor({ ...bareAuth, clientFields: [{ ...secretField, required: false }] });

    expect(markup).not.toContain("Client Secret");
  });
});
