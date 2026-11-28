import type { OAuth2AuthDefinition, ProviderDefinition } from "../core/types.ts";

/**
 * An application OAuth client a deployment sets through `OAUTH_<SERVICE>_*` variables instead of the admin API.
 * The values are raw: the config service validates them as it validates an admin API write.
 */
export interface EnvironmentOAuthClient {
  service: string;
  auth: OAuth2AuthDefinition;
  /** `OAUTH_<SERVICE>`, the prefix every variable of this service starts with. */
  prefix: string;
  clientIdVariable: string;
  clientSecretVariable: string;
  scopesVariable: string;
  redirectUriVariable: string;
  /** Variable name of each client config field the provider declares, by field key. */
  fieldVariables: Record<string, string>;
  clientId: string;
  /** Empty for a public client (`tokenEndpointAuthMethod: "none"`) that sets only the client id. */
  clientSecret: string;
  /** Scope subset from `OAUTH_<SERVICE>_SCOPES`; unset means the provider defaults. */
  requestedScopes?: string[];
  /** Redirect URI override from `OAUTH_<SERVICE>_REDIRECT_URI`; unset means the runtime callback. */
  redirectUri?: string;
  /** Client config field values set by the environment, by field key, whatever their storage location. */
  fields: Record<string, string>;
}

type ProviderEntry = Pick<ProviderDefinition, "service" | "auth">;

/** What one variable name sets. */
type VariableMeaning =
  | { service: string; part: "clientId" | "clientSecret" | "scopes" | "redirectUri" }
  | { service: string; part: "field"; key: string };

const reservedSuffixes = {
  CLIENT_ID: "clientId",
  CLIENT_SECRET: "clientSecret",
  SCOPES: "scopes",
  REDIRECT_URI: "redirectUri",
} as const;

const bareReservedNames = new Set(Object.keys(reservedSuffixes).map((suffix) => `OAUTH_${suffix}`));

const reservedPattern = /^OAUTH_(.+)_(CLIENT_ID|CLIENT_SECRET|SCOPES|REDIRECT_URI)$/;

/**
 * The variable prefix of a service: `OAUTH_` and the service id upper-cased, with `-` written as `_`
 * because a hyphen is not valid in an environment variable name.
 */
export function oauthClientEnvironmentPrefix(service: string): string {
  return `OAUTH_${service.toUpperCase().replaceAll("-", "_")}`;
}

/**
 * The variable suffix of a client config field: its key in upper snake case, so `primarySignatureKey` is read
 * from `OAUTH_<SERVICE>_PRIMARY_SIGNATURE_KEY`.
 */
export function oauthClientEnvironmentFieldSuffix(key: string): string {
  return key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toUpperCase();
}

/**
 * The string-valued `OAUTH_` entries of an environment, sorted by name, for a cache key. Non-string entries, such
 * as the `OAUTH_KV` binding or the `OAUTH_PROVIDER` helpers the OAuth provider library adds, are left out, so
 * they never change the key.
 */
export function listOAuthClientEnvironmentVariables(environment: object): [string, string][] {
  return Object.entries(environment)
    .filter((entry): entry is [string, string] => entry[0].startsWith("OAUTH_") && typeof entry[1] === "string")
    .sort(([left], [right]) => left.localeCompare(right));
}

/**
 * Every variable name the OAuth2 providers of a catalog read, with what it sets, and the prefix of each OAuth2
 * service. A name that two providers, or one provider twice, would read has several meanings. Only OAuth2
 * providers count, so a provider without OAuth2 never makes a name ambiguous.
 */
export function describeOAuthClientEnvironment(providers: readonly ProviderEntry[]): {
  meanings: Map<string, VariableMeaning[]>;
  oauthPrefixes: Map<string, string>;
} {
  const meanings = new Map<string, VariableMeaning[]>();
  const oauthPrefixes = new Map<string, string>();
  const add = (name: string, meaning: VariableMeaning) => meanings.set(name, [...(meanings.get(name) ?? []), meaning]);
  for (const provider of providers) {
    const auth = findOAuth2(provider);
    if (!auth) continue;
    const prefix = oauthClientEnvironmentPrefix(provider.service);
    oauthPrefixes.set(prefix, provider.service);
    for (const [suffix, part] of Object.entries(reservedSuffixes)) {
      add(`${prefix}_${suffix}`, { service: provider.service, part });
    }
    for (const field of auth.clientConfigFields ?? []) {
      add(`${prefix}_${oauthClientEnvironmentFieldSuffix(field.key)}`, {
        service: provider.service,
        part: "field",
        key: field.key,
      });
    }
  }
  return { meanings, oauthPrefixes };
}

/**
 * Why a variable name cannot be read unambiguously, or undefined when it can: it has several meanings, or it is
 * a field of one service whose name lies under the prefix of another OAuth2 service.
 */
export function describeOAuthClientVariableAmbiguity(
  name: string,
  { meanings, oauthPrefixes }: ReturnType<typeof describeOAuthClientEnvironment>,
): string | undefined {
  const matches = meanings.get(name) ?? [];
  const crossings =
    matches.length === 1 && matches[0]!.part === "field"
      ? prefixesUnder(name, oauthClientEnvironmentPrefix(matches[0]!.service), oauthPrefixes)
      : [];
  if (matches.length < 2 && !crossings.length) return undefined;
  const readings = [
    ...matches
      .toSorted((left, right) => (left.service < right.service ? -1 : left.service > right.service ? 1 : 0))
      .map(describeMeaning),
    ...crossings.map((service) => `under the ${oauthClientEnvironmentPrefix(service)}_ prefix of ${service}`),
  ];
  return `${name} is ambiguous: it is ${readings.join(" and ")}.`;
}

function findOAuth2(provider: ProviderEntry): OAuth2AuthDefinition | undefined {
  const auth = provider.auth.find((auth) => auth.type === "oauth2");
  return auth?.type === "oauth2" ? auth : undefined;
}

const partLabels = {
  clientId: "client id",
  clientSecret: "client secret",
  scopes: "scopes",
  redirectUri: "redirect URI",
} as const;

function describeMeaning(meaning: VariableMeaning): string {
  return meaning.part === "field"
    ? `the ${meaning.key} field of ${meaning.service}`
    : `the ${partLabels[meaning.part]} of ${meaning.service}`;
}

/** The other OAuth2 services whose prefix a variable name lies under, beyond its own service's prefix. */
function prefixesUnder(name: string, ownPrefix: string, oauthPrefixes: Map<string, string>): string[] {
  const services: string[] = [];
  for (let index = name.indexOf("_", ownPrefix.length + 1); index > 0; index = name.indexOf("_", index + 1)) {
    const service = oauthPrefixes.get(name.slice(0, index));
    if (service) services.push(service);
  }
  return services;
}

/**
 * Read the application OAuth clients an environment sets. Per OAuth2 provider `<SERVICE>`, it reads
 * `OAUTH_<SERVICE>_CLIENT_ID`, `_CLIENT_SECRET`, `_SCOPES` (comma- or space-separated), `_REDIRECT_URI`
 * and `OAUTH_<SERVICE>_<FIELD>` for each client config field the provider declares, `<FIELD>` being the
 * field key in upper snake case. A blank value counts as unset. Other `OAUTH_` names, such as the `OAUTH_KV`
 * binding, are ignored, unless they end in one of the four fixed suffixes or lie under the prefix of a service
 * the environment configures.
 *
 * Throws, naming the variable, when a name maps to no OAuth2 provider or is ambiguous, when a fixed name such as
 * `OAUTH_CLIENT_ID` lacks a service name, when a value is not a string, when only part of a client is set (a
 * public client may set the client id alone), or when the provider requires a field that has no default and no
 * value.
 */
export function readOAuthClientEnvironment(
  environment: object,
  providers: readonly ProviderEntry[],
): EnvironmentOAuthClient[] {
  const variables = Object.entries(environment)
    .filter(([name]) => name.startsWith("OAUTH_"))
    .sort(([left], [right]) => left.localeCompare(right));
  if (!variables.length) return [];

  const description = describeOAuthClientEnvironment(providers);
  const providersByService = new Map(providers.map((provider) => [provider.service, provider]));

  const read = new Map<string, { meaning: VariableMeaning; value: string }[]>();
  const unrecognized: string[] = [];
  for (const [name, value] of variables) {
    // A blank value counts as unset, before any check of its name.
    if (value === undefined || (typeof value === "string" && !value.trim())) continue;
    const matches = description.meanings.get(name) ?? [];
    if (!matches.length) {
      if (bareReservedNames.has(name)) {
        throw new Error(
          `${name} is missing a service name: set ${name.replace(/^OAUTH_/, "OAUTH_<SERVICE>_")} instead.`,
        );
      }
      const reserved = reservedPattern.exec(name);
      if (reserved) throw new Error(describeUnknownReservedName(name, reserved[1]!, providers));
      unrecognized.push(name);
      continue;
    }
    const ambiguity = describeOAuthClientVariableAmbiguity(name, description);
    if (ambiguity) throw new Error(ambiguity);
    if (typeof value !== "string") throw new Error(`${name} must be a string.`);
    const meaning = matches[0]!;
    read.set(meaning.service, [...(read.get(meaning.service) ?? []), { meaning, value: value.trim() }]);
  }

  const clients = [...read].map(([service, entries]): EnvironmentOAuthClient => {
    const auth = findOAuth2(providersByService.get(service)!)!;
    const prefix = oauthClientEnvironmentPrefix(service);
    const client: EnvironmentOAuthClient = {
      service,
      auth,
      prefix,
      clientIdVariable: `${prefix}_CLIENT_ID`,
      clientSecretVariable: `${prefix}_CLIENT_SECRET`,
      scopesVariable: `${prefix}_SCOPES`,
      redirectUriVariable: `${prefix}_REDIRECT_URI`,
      fieldVariables: Object.fromEntries(
        (auth.clientConfigFields ?? []).map((field) => [
          field.key,
          `${prefix}_${oauthClientEnvironmentFieldSuffix(field.key)}`,
        ]),
      ),
      clientId: "",
      clientSecret: "",
      fields: {},
    };
    for (const { meaning, value } of entries) {
      if (meaning.part === "clientId") client.clientId = value;
      else if (meaning.part === "clientSecret") client.clientSecret = value;
      else if (meaning.part === "scopes") client.requestedScopes = value.split(/[\s,]+/).filter(Boolean);
      else if (meaning.part === "redirectUri") client.redirectUri = value;
      else if (meaning.part === "field") client.fields[meaning.key] = value;
    }

    if (!client.clientId) {
      const other = entries.find((entry) => entry.meaning.part !== "clientId")!;
      throw new Error(`${client.clientIdVariable} is required when ${variableOf(client, other.meaning)} is set.`);
    }
    if (!client.clientSecret && auth.tokenEndpointAuthMethod !== "none") {
      throw new Error(`${client.clientSecretVariable} is required when ${client.clientIdVariable} is set.`);
    }
    for (const field of auth.clientConfigFields ?? []) {
      if (field.required && !field.defaultValue?.trim() && !client.fields[field.key]) {
        throw new Error(
          `${client.fieldVariables[field.key]} is required to configure ${service} from the environment.`,
        );
      }
    }
    return client;
  });

  // A name under the prefix of a service this environment configures that no service reads is a typo, which
  // would otherwise drop a client field silently. The longest matching prefix of any OAuth2 service names the
  // service, configured or not, so a typo under OAUTH_OUTLOOK_CALENDAR_ is blamed on outlook_calendar, not on a
  // configured outlook.
  const clientsByService = new Map(clients.map((client) => [client.service, client]));
  const byLongestPrefix = [...description.oauthPrefixes].toSorted(([left], [right]) => right.length - left.length);
  for (const name of unrecognized) {
    if (!clients.some((client) => name.startsWith(`${client.prefix}_`))) continue;
    const [prefix, service] = byLongestPrefix.find(([prefix]) => name.startsWith(`${prefix}_`))!;
    const client = clientsByService.get(service);
    if (!client) {
      throw new Error(
        `${name} is not read: it lies under the ${prefix}_ prefix of ${service}, whose client id ${prefix}_CLIENT_ID is not set.`,
      );
    }
    const known = [
      client.clientIdVariable,
      client.clientSecretVariable,
      client.scopesVariable,
      client.redirectUriVariable,
      ...Object.values(client.fieldVariables),
    ];
    throw new Error(`${name} is not read for ${client.service}, which reads ${known.join(", ")}.`);
  }
  return clients;
}

function variableOf(client: EnvironmentOAuthClient, meaning: VariableMeaning): string {
  if (meaning.part === "field") return client.fieldVariables[meaning.key]!;
  return {
    clientId: client.clientIdVariable,
    clientSecret: client.clientSecretVariable,
    scopes: client.scopesVariable,
    redirectUri: client.redirectUriVariable,
  }[meaning.part];
}

function describeUnknownReservedName(name: string, key: string, providers: readonly ProviderEntry[]): string {
  const provider = providers.find((provider) => oauthClientEnvironmentPrefix(provider.service) === `OAUTH_${key}`);
  if (provider) return `${name}: ${provider.service} does not support oauth2.`;
  return `${name} names no provider: no OAuth2 service id maps to ${key}.`;
}
