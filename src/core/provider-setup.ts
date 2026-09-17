import type {
  ApiKeyAuthDefinition,
  CredentialDefinition,
  OAuth2AuthDefinition,
  OAuthClientConfigFieldDefinition,
  ProviderAuthDefinition,
} from "./types.ts";

/** Form metadata only. OAuth endpoints, request signing and token handling remain inside the connector. */
export type ProviderAuthSetup =
  | { type: "no_auth" }
  | { type: "api_key"; fields: CredentialDefinition[] }
  | {
      type: "custom_credential";
      /** Provider-provided display name for this auth mode, e.g. "Service Account". */
      label?: string;
      /** Provider-provided help text describing when to use this auth mode. */
      description?: string;
      fields: CredentialDefinition[];
    }
  | {
      type: "oauth2";
      /** clientId and clientSecret carry no location; every other field names the request object it belongs to. */
      clientFields: OAuthClientConfigFieldDefinition[];
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
      return { type: "api_key", fields: apiKeyCredentialFields(auth) };
    case "custom_credential":
      return { type: "custom_credential", label: auth.label, description: auth.description, fields: auth.fields };
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

/** The key itself plus the provider's extra fields, in the shape credential forms and validation share. */
export function apiKeyCredentialFields(auth: ApiKeyAuthDefinition): CredentialDefinition[] {
  return [
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
  ];
}

/** Client configuration fields in the same shape as provider-declared credential fields. */
export function oauthClientFields(auth: OAuth2AuthDefinition): OAuthClientConfigFieldDefinition[] {
  const fields: OAuthClientConfigFieldDefinition[] = [
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
    (auth.clientConfigFields ?? []).map((field) => ({ ...field, location: field.location ?? "extra" })),
  );
}
