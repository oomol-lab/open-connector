import type { CredentialDefinition, OAuth2AuthDefinition } from "./types.ts";

import { describe, expect, it } from "vitest";
import { describeProviderAuth } from "./provider-setup.ts";

describe("provider setup descriptions", () => {
  it("describes API keys and custom credentials without asking hosts to invent fields", () => {
    const tenant: CredentialDefinition = {
      key: "tenant",
      label: "Workspace",
      inputType: "text",
      required: true,
      secret: false,
    };
    expect(
      describeProviderAuth({
        type: "api_key",
        label: "Personal token",
        description: "Create a token in settings",
        extraFields: [tenant],
      }),
    ).toEqual({
      type: "api_key",
      fields: [
        {
          key: "apiKey",
          label: "Personal token",
          description: "Create a token in settings",
          inputType: "password",
          required: true,
          secret: true,
        },
        tenant,
      ],
    });
    expect(
      describeProviderAuth({
        type: "custom_credential",
        fields: [tenant],
        testAction: { actionName: "check", input: {} },
      }),
    ).toEqual({ type: "custom_credential", fields: [tenant] });
    expect(describeProviderAuth({ type: "no_auth" })).toEqual({ type: "no_auth" });
  });

  it("carries the custom credential label and description for console display", () => {
    expect(
      describeProviderAuth({
        type: "custom_credential",
        label: "Service Account",
        description: "Connect with a Google Cloud service account key.",
        fields: [],
      }),
    ).toEqual({
      type: "custom_credential",
      label: "Service Account",
      description: "Connect with a Google Cloud service account key.",
      fields: [],
    });
  });
});

const oauth: OAuth2AuthDefinition = {
  type: "oauth2",
  authorizationUrl: "https://example.com/authorize",
  tokenUrl: "https://example.com/token",
  tokenEndpointAuthMethod: "client_secret_post",
  scopes: ["read", "write"],
  requiredScopes: ["profile"],
};

it("does not turn default or required scopes into form options", () => {
  expect(describeProviderAuth(oauth)).toMatchObject({
    scopes: ["read", "write"],
    requiredScopes: ["profile"],
    authorizationOptions: undefined,
  });
});

it("preserves curated text and derives selection flags from the request policy", () => {
  expect(
    describeProviderAuth({
      ...oauth,
      authorizationOptions: [
        { id: "delete", label: "Delete resources", description: "Permanently delete resources.", risk: "destructive" },
      ],
    }),
  ).toMatchObject({
    authorizationOptions: [
      {
        id: "delete",
        label: "Delete resources",
        description: "Permanently delete resources.",
        risk: "destructive",
        required: false,
        defaultSelected: false,
      },
    ],
  });
});
