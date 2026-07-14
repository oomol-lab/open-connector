import type { ConnectionService, ConnectionSummary } from "../connection-service.ts";
import type { CredentialDefinition, OAuth2AuthDefinition } from "../core/types.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";

import { ConnectionError } from "../connection-service.ts";
import { normalizeCredentialValues } from "../core/credential-fields.ts";
import { OAuthClientConfigError } from "./oauth-client-config-service.ts";
import { createClientCredentialsExtraFields, requestClientCredentialsToken } from "./oauth-token.ts";

export interface OAuthClientCredentialsConnectInput {
  service: string;
  connectionName?: string;
  values?: Record<string, unknown>;
}

/** Creates a provider connection without browser authorization. */
export class OAuthClientCredentialsService {
  private readonly clientConfigs: OAuthClientConfigService;
  private readonly connections: ConnectionService;

  constructor(input: { clientConfigs: OAuthClientConfigService; connections: ConnectionService }) {
    this.clientConfigs = input.clientConfigs;
    this.connections = input.connections;
  }

  async connect(input: OAuthClientCredentialsConnectInput): Promise<ConnectionSummary> {
    const { service, connectionName } = input;
    this.connections.assertProviderAvailable(service);
    const auth = this.clientConfigs.getOAuthDefinition(service);
    if (auth.flow !== "client_credentials") {
      throw new ConnectionError("unsupported_oauth_flow", `${service} does not use the client_credentials OAuth flow.`);
    }

    const values = normalizeCredentialValues({
      fields: createClientCredentialsFields(auth),
      values: {
        ...Object.fromEntries(
          (auth.clientConfigFields ?? [])
            .filter((field) => field.defaultValue !== undefined)
            .map((field) => [field.key, field.defaultValue]),
        ),
        ...(input.values ?? {}),
      },
      createError: (message) => new ConnectionError("invalid_input", message),
    });
    const config = createClientCredentialsConfig(auth, values);

    const tokenResponse = await requestClientCredentialsToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      extraFields: createClientCredentialsExtraFields(auth, config),
      responseEnvelope: auth.tokenResponseEnvelope,
      scopes: auth.scopes,
      scopeSeparator: auth.scopeSeparator,
      tokenRequestFields: auth.tokenRequestFields,
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      tokenRequestFormat: auth.tokenRequestFormat,
      tokenUrl: this.resolveTokenUrl(service, auth.tokenUrl, config),
      sensitiveValues: Object.values(config.secretExtra),
      createError: (message) => new ConnectionError("oauth_token_exchange_failed", message),
    });

    return await this.connections.setOAuthCredential(
      service,
      {
        ...tokenResponse,
        clientCredentials: config,
        metadata: {
          ...tokenResponse.metadata,
          oauthClientId: config.clientId,
          oauthClientExtra: config.extra,
        },
      },
      connectionName,
    );
  }

  private resolveTokenUrl(service: string, tokenUrl: string, config: { extra: Record<string, string> }): string {
    try {
      return this.clientConfigs.resolveEndpointUrl(service, tokenUrl, config);
    } catch (error) {
      if (error instanceof OAuthClientConfigError) {
        throw new ConnectionError(error.code, error.message);
      }
      throw error;
    }
  }
}

function createClientCredentialsFields(auth: OAuth2AuthDefinition): CredentialDefinition[] {
  return [
    {
      key: "clientId",
      label: "Client ID",
      inputType: "text",
      required: true,
      secret: false,
    },
    {
      key: "clientSecret",
      label: "Client secret",
      inputType: "password",
      required: auth.tokenEndpointAuthMethod !== "none",
      secret: true,
    },
    ...(auth.clientConfigFields ?? []),
  ];
}

function createClientCredentialsConfig(
  auth: OAuth2AuthDefinition,
  values: Record<string, string>,
): {
  clientId: string;
  clientSecret: string;
  extra: Record<string, string>;
  secretExtra: Record<string, string>;
} {
  const extra: Record<string, string> = {};
  const secretExtra: Record<string, string> = {};
  for (const field of auth.clientConfigFields ?? []) {
    const target = (field.location ?? (field.secret ? "secretExtra" : "extra")) === "secretExtra" ? secretExtra : extra;
    if (values[field.key] !== undefined) {
      target[field.key] = values[field.key];
    }
  }
  return {
    clientId: values.clientId,
    clientSecret: values.clientSecret ?? "",
    extra,
    secretExtra,
  };
}
