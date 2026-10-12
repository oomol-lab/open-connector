import type { CredentialDefinition } from "./types.ts";

import { describe, expect, it } from "vitest";
import { acceptsPublicClient, describeProviderAuth } from "./provider-setup.ts";

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

describe("public clients", () => {
  const oauth = {
    type: "oauth2" as const,
    authorizationUrl: "https://provider.example/oauth/authorize",
    tokenUrl: "https://provider.example/oauth/token",
    scopes: ["read"],
  };

  it("requires the client secret unless the provider sends none or lets it be left blank", () => {
    expect(acceptsPublicClient({ tokenEndpointAuthMethod: "client_secret_post" })).toBe(false);
    expect(acceptsPublicClient({ tokenEndpointAuthMethod: "client_secret_basic", clientSecretOptional: false })).toBe(
      false,
    );
    expect(acceptsPublicClient({ tokenEndpointAuthMethod: "none" })).toBe(true);
    expect(acceptsPublicClient({ tokenEndpointAuthMethod: "client_secret_post", clientSecretOptional: true })).toBe(
      true,
    );
  });

  it("describes an optional secret as a field that is not required, and says why", () => {
    const described = describeProviderAuth({
      ...oauth,
      tokenEndpointAuthMethod: "client_secret_post",
      clientSecretOptional: true,
      pkce: { method: "S256" },
    });
    if (described.type !== "oauth2") throw new Error("Expected an OAuth description");
    expect(described.clientFields.find((field) => field.key === "clientSecret")).toMatchObject({
      required: false,
      secret: true,
    });
    expect(described.clientSecretOptional).toBe(true);

    const confidential = describeProviderAuth({ ...oauth, tokenEndpointAuthMethod: "client_secret_post" });
    if (confidential.type !== "oauth2") throw new Error("Expected an OAuth description");
    expect(confidential.clientFields.find((field) => field.key === "clientSecret")).toMatchObject({ required: true });
    expect(confidential).not.toHaveProperty("clientSecretOptional");

    const publicOnly = describeProviderAuth({ ...oauth, tokenEndpointAuthMethod: "none" });
    if (publicOnly.type !== "oauth2") throw new Error("Expected an OAuth description");
    expect(publicOnly.clientFields.find((field) => field.key === "clientSecret")).toMatchObject({ required: false });
    expect(publicOnly).not.toHaveProperty("clientSecretOptional");
  });
});
