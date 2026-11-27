import type { AuthDefinition, CredentialField, OAuthConfig, ProviderDefinition } from "./model";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import { OAuthAppForm, oauthClientConfigRequestBody } from "./oauth-app-form";

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

function markupFor(auth: Extract<AuthDefinition, { type: "oauth2" }>, config?: OAuthConfig): string {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n: createAppI18n("en") },
      createElement(OAuthAppForm, { provider: provider(auth), auth, config, onRefresh: vi.fn() }),
    ),
  );
}

describe("OAuthAppForm", () => {
  it.each([undefined, null, [], ["https://www.googleapis.com/auth/gmail.send", "future:scope"]])(
    "preserves the saved scope selection when editing the same client: %j",
    (requestedScopes) => {
      const body = oauthClientConfigRequestBody({
        clientId: " client ",
        clientSecret: "replacement-secret",
        fields: [],
        values: {},
        clearedSecrets: {},
        config: { service: "gmail", configured: true, clientId: "client", requestedScopes },
      });
      expect(body).toMatchObject({ clientId: "client", clientSecret: "replacement-secret" });
      expect(JSON.parse(JSON.stringify(body)).requestedScopes).toEqual(requestedScopes ?? undefined);
    },
  );

  it("uses provider defaults when replacing the OAuth client", () => {
    const body = oauthClientConfigRequestBody({
      clientId: "new-client",
      clientSecret: "secret",
      fields: [],
      values: {},
      clearedSecrets: {},
      config: { service: "gmail", configured: true, clientId: "old-client", requestedScopes: ["old-scope"] },
    });
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty("requestedScopes");
  });

  it("omits unchanged secrets but preserves explicit clearing when saving scopes", () => {
    const fields: CredentialField[] = ["kept", "cleared"].map((key) => ({
      key,
      label: key,
      inputType: "password",
      required: false,
      secret: true,
      location: "secretExtra",
    }));
    const body = oauthClientConfigRequestBody({
      clientId: "client",
      clientSecret: "",
      fields,
      values: { kept: "", cleared: "" },
      clearedSecrets: { cleared: true },
    });
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      clientId: "client",
      extra: {},
      secretExtra: { cleared: "" },
    });
  });

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

it("keeps saved secrets optional and offers explicit clearing without displaying them", () => {
  const auth: Extract<AuthDefinition, { type: "oauth2" }> = {
    type: "oauth2",
    scopes: [],
    clientFields: [
      { key: "clientSecret", label: "Client Secret", inputType: "password", required: true, secret: true },
      {
        key: "signingSecret",
        label: "Signing Secret",
        inputType: "password",
        required: false,
        secret: true,
        location: "secretExtra",
      },
    ],
  };
  const config: OAuthConfig = { service: "example", configured: true, clientId: "client", missingFields: [] };
  const saved = markupFor(auth, config);
  expect(saved).toContain("Leave blank to keep the saved secret");
  expect(saved).toContain("Clear saved Signing Secret when saving");
  expect(saved).not.toMatch(/type="password"[^>]*required/);
  expect(markupFor(auth)).toMatch(/type="password"[^>]*required/);
  expect(markupFor(auth)).not.toContain("Clear saved Signing Secret when saving");
});
