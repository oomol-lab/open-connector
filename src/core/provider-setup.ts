import type {
  ProviderAuthDefinition,
  CredentialDefinition,
  OAuth2AuthDefinition,
  OAuthClientConfigFieldDefinition,
} from "./types.ts";

export interface OAuthClientField extends CredentialDefinition {
  /** Omit for clientId/clientSecret; other fields go in the named request object. */
  location?: "extra" | "secretExtra";
  defaultValue?: string;
}

/** Form metadata only. OAuth endpoints, request signing and token handling remain inside the connector. */
export type ProviderAuthSetup =
  | { type: "no_auth" }
  | { type: "api_key" | "custom_credential"; fields: CredentialDefinition[] }
  | {
      type: "oauth2";
      clientFields: OAuthClientField[];
      clientSetup?: OAuth2AuthDefinition["clientSetup"];
      scopes: string[];
      authorizationOptions?: OAuth2AuthDefinition["authorizationOptions"];
    };

/** Describe the inputs accepted by the existing connection and OAuth-client APIs. */
export function describeProviderAuth(auth: ProviderAuthDefinition): ProviderAuthSetup {
  switch (auth.type) {
    case "no_auth":
      return { type: "no_auth" };
    case "api_key":
      return {
        type: "api_key",
        fields: [
          {
            key: "apiKey",
            label: auth.label ?? "API key",
            inputType: "password",
            required: true,
            secret: true,
            placeholder: auth.placeholder,
            description: auth.description,
          },
          ...(auth.extraFields ?? []),
        ],
      };
    case "custom_credential":
      return { type: "custom_credential", fields: auth.fields };
    case "oauth2":
      return {
        type: "oauth2",
        clientFields: oauthClientFields(auth),
        clientSetup: auth.clientSetup,
        scopes: auth.scopes,
        authorizationOptions: auth.authorizationOptions,
      };
  }
}

/** Client configuration fields in the same shape as provider-declared credential fields. */
export function oauthClientFields(auth: OAuth2AuthDefinition): OAuthClientField[] {
  const fields: OAuthClientField[] = [
    { key: "clientId", label: "Client ID", inputType: "text", required: true, secret: false },
    {
      key: "clientSecret",
      label: "Client secret",
      inputType: "password",
      required: auth.tokenEndpointAuthMethod !== "none",
      secret: true,
    },
  ];
  return fields.concat(
    (auth.clientConfigFields ?? []).map((field: OAuthClientConfigFieldDefinition) => ({
      ...field,
      location: field.location ?? "extra",
    })),
  );
}
