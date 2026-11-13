import type {
  ApiKeyAuthDefinition,
  CredentialDefinition,
  OAuth2AuthDefinition,
  OAuthAuthorizationOption,
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
      supportsScopeSelection: boolean;
      /** Scopes added to every authorization request for connection validation or renewal. */
      requiredScopes?: string[];
      authorizationOptions?: OAuthAuthorizationOptionSetup[];
    };

interface OAuthAuthorizationOptionSetup extends OAuthAuthorizationOption {
  required: boolean;
  defaultSelected: boolean;
}

export interface ProviderSetupLabels {
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

/** Describe the inputs accepted by the existing connection and OAuth-client APIs. */
export function describeProviderAuth(auth: ProviderAuthDefinition, labels?: ProviderSetupLabels): ProviderAuthSetup {
  switch (auth.type) {
    case "no_auth":
      return { type: "no_auth" };
    case "api_key":
      return { type: "api_key", fields: apiKeyCredentialFields(auth, labels) };
    case "custom_credential":
      return { type: "custom_credential", label: auth.label, description: auth.description, fields: auth.fields };
    case "oauth2":
      return {
        type: "oauth2",
        clientFields: oauthClientFields(auth, labels),
        clientSetup: auth.clientSetup,
        scopes: auth.scopes,
        supportsScopeSelection: auth.authorizationRequestFields?.scope !== false,
        requiredScopes: auth.requiredScopes,
        authorizationOptions: describeOAuthAuthorizationOptions(auth),
      };
  }
}

function describeOAuthAuthorizationOptions(auth: OAuth2AuthDefinition): OAuthAuthorizationOptionSetup[] {
  const defaults = new Set(auth.scopes);
  const required = new Set(auth.requiredScopes);
  const options = new Map(auth.authorizationOptions?.map((option) => [option.id, option]));
  const candidates = new Set([...defaults, ...required, ...options.keys()]);

  // Selection flags come from request policy, never from provider-reported grants.
  return [...candidates].map((id) => {
    const option = options.get(id);
    return {
      id,
      label: option?.label ?? id,
      description: option?.description ?? "",
      risk: option?.risk ?? "standard",
      required: required.has(id),
      defaultSelected: defaults.has(id),
    };
  });
}

/** The key itself plus the provider's extra fields, in the shape credential forms and validation share. */
export function apiKeyCredentialFields(
  auth: ApiKeyAuthDefinition,
  labels?: ProviderSetupLabels,
): CredentialDefinition[] {
  return [
    {
      key: "apiKey",
      label: auth.label ?? labels?.apiKey ?? "API key",
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
export function oauthClientFields(
  auth: OAuth2AuthDefinition,
  labels?: ProviderSetupLabels,
): OAuthClientConfigFieldDefinition[] {
  const fields: OAuthClientConfigFieldDefinition[] = [
    { key: "clientId", label: labels?.clientId ?? "Client ID", inputType: "text", required: true, secret: false },
    {
      key: "clientSecret",
      label: labels?.clientSecret ?? "Client secret",
      inputType: "password",
      required: auth.tokenEndpointAuthMethod !== "none",
      secret: true,
    },
  ];
  return fields.concat(
    (auth.clientConfigFields ?? []).map((field) => ({ ...field, location: field.location ?? "extra" })),
  );
}
