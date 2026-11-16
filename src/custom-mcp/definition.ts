import type {
  ActionDefinition,
  ProviderAuthDefinition,
  OAuth2AuthDefinition,
  ProviderDefinition,
} from "../core/types.ts";
import type { McpHttpTransport } from "../providers/mcp-client.ts";

export interface McpHeaderDefinition {
  name: string;
  prefix: string;
}

export type CustomMcpAuth =
  | { type: "none" }
  | { type: "headers"; headers: McpHeaderDefinition[] }
  | { type: "oauth2"; definition: OAuth2AuthDefinition };

export interface CustomMcpRegistration {
  service?: string;
  displayName: string;
  endpoint: string;
  transport: McpHttpTransport;
  auth:
    | { type: "none" }
    | { type: "headers"; headers: McpHeaderDefinition[] }
    | {
        type: "oauth2";
        client?: { clientId: string; clientSecret?: string };
        manual?: Pick<OAuth2AuthDefinition, "authorizationUrl" | "tokenUrl" | "scopes" | "tokenEndpointAuthMethod"> & {
          issuer: string;
        };
      };
}
/** Administrator-owned endpoint and authentication layout; credentials belong to connections. */
export interface CustomMcpConfig {
  service: string;
  displayName: string;
  endpoint: string;
  transport: McpHttpTransport;
  auth: CustomMcpAuth;
  enabled: boolean;
}

export interface CustomMcpRecord extends CustomMcpConfig {
  revision: string;
  actions: ActionDefinition[];
  syncConnectionId?: string;
  syncedAt?: string;
  syncError?: string;
}

export function customMcpProvider(record: CustomMcpRecord): ProviderDefinition {
  const auth = providerAuth(record.auth);
  return {
    service: record.service,
    displayName: record.displayName,
    categories: ["Developer Tools"],
    authTypes: [auth.type],
    auth: [auth],
    actions: record.enabled ? record.actions : [],
  };
}

function providerAuth(auth: CustomMcpAuth): ProviderAuthDefinition {
  switch (auth.type) {
    case "none":
      return { type: "no_auth" };
    case "oauth2":
      return auth.definition;
    case "headers":
      return {
        type: "custom_credential",
        fields: auth.headers.map((header) => ({
          key: header.name,
          label: header.name,
          inputType: "password",
          required: true,
          secret: true,
          description: header.prefix ? `Sent with the prefix ${JSON.stringify(header.prefix)}.` : undefined,
        })),
      };
  }
}

/** Client metadata Connect sends when it registers itself with an MCP authorization server. */
export interface McpOAuthClientMetadata {
  clientName: string;
  logoUri?: string;
  clientUri?: string;
}

/** Deployment settings for {@link McpOAuthClientMetadata}; blank values fall back to the defaults. */
export interface McpOAuthClientSettings {
  clientName?: string;
  logoUri?: string;
  clientUri?: string;
}

export const DEFAULT_MCP_OAUTH_CLIENT_NAME: string = "OOMOL Connect";

/** Read the client name and the optional public HTTPS links shown on authorization consent screens. */
export function readMcpOAuthClientMetadata(settings: McpOAuthClientSettings): McpOAuthClientMetadata {
  return {
    clientName: settings.clientName?.trim() || DEFAULT_MCP_OAUTH_CLIENT_NAME,
    logoUri: readHttpsUrl(settings.logoUri, "OOMOL_CONNECT_CUSTOM_MCP_CLIENT_LOGO_URI"),
    clientUri: readHttpsUrl(settings.clientUri, "OOMOL_CONNECT_CUSTOM_MCP_CLIENT_URI"),
  };
}

function readHttpsUrl(value: string | undefined, name: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!URL.canParse(trimmed) || new URL(trimmed).protocol !== "https:")
    throw new Error(`${name} must be an https URL.`);
  return trimmed;
}

/** Display names share one namespace with built-in providers. */
export function customMcpNameKey(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase();
}

/** Suggest a readable service identifier from the display name. */
export function suggestMcpService(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
