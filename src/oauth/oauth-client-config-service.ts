import type { CatalogStore } from "../catalog-store.ts";
import type { OAuthAuthDefinition, OAuthClientConfigFieldDefinition, ProviderAuthDefinition } from "../core/types.ts";

import { optionalRecord, optionalString, optionalStringArray } from "../core/cast.ts";
import { normalizeCredentialValues } from "../core/credential-fields.ts";
import { assertPublicHttpUrl } from "../core/request.ts";

/**
 * OAuth client configuration supplied by an open-source runtime user.
 */
export type OAuthClientConfig = {
  service: string;
  clientId: string;
  clientSecret: string;
  /** Non-empty provider-declared scope subset to request. Omit to use every provider default. */
  requestedScopes?: string[];
  extra: Record<string, string>;
  secretExtra: Record<string, string>;
};

export interface OAuthClientConfigInput {
  clientId: string;
  clientSecret: string;
  /** Non-empty provider-declared scope subset to request. Omit to use every provider default. */
  requestedScopes?: string[];
  extra?: Record<string, unknown>;
  secretExtra?: Record<string, unknown>;
}

/**
 * OAuth client config summary safe to return to the local console.
 */
export interface OAuthClientConfigSummary {
  service: string;
  configured: boolean;
  customClientAvailable: boolean;
  clientId: string | null;
  expectedRedirectUri: string;
  auth: OAuthAuthDefinition;
  requestedScopes: string[] | null;
  effectiveScopes: string[];
  extra: Record<string, string>;
}

export interface OAuthClientConfigServiceOptions {
  catalog: CatalogStore;
  origin: string;
  store: IOAuthClientConfigStore;
  isCustomClientConfigAvailable?: (service: string) => boolean;
}

/**
 * Storage contract for local OAuth client configs.
 */
export interface IOAuthClientConfigStore {
  get(service: string): Promise<OAuthClientConfig | undefined>;
  set(config: OAuthClientConfig): Promise<void>;
  delete(service: string): Promise<void>;
  list(): Promise<OAuthClientConfig[]>;
}

/**
 * Manages user-provided OAuth app client configuration.
 *
 * The open-source runtime intentionally requires users to bring their own
 * OAuth app. Managed OAuth clients are intentionally outside this local runtime.
 */
export class OAuthClientConfigService {
  private static readonly callbackPath = "/oauth/callback";

  private readonly catalog: CatalogStore;
  private readonly origin: string;
  private readonly store: IOAuthClientConfigStore;
  private readonly isCustomClientConfigAvailable: (service: string) => boolean;

  constructor(input: OAuthClientConfigServiceOptions) {
    this.catalog = input.catalog;
    this.origin = input.origin.replace(/\/$/, "");
    this.store = input.store;
    this.isCustomClientConfigAvailable = input.isCustomClientConfigAvailable ?? (() => false);
  }

  async listConfigs(): Promise<OAuthClientConfigSummary[]> {
    const configured = new Map((await this.store.list()).map((config) => [config.service, config]));
    return this.listOAuthProviders()
      .map((provider) => this.toSummary(provider.service, provider.auth, configured.get(provider.service)))
      .sort((left, right) => Number(right.configured) - Number(left.configured));
  }

  async getConfig(service: string): Promise<OAuthClientConfig | undefined> {
    this.getOAuthDefinition(service);
    return normalizeStoredOAuthClientConfig(await this.store.get(service));
  }

  async upsertConfig(input: OAuthClientConfigInput & { service: string }): Promise<OAuthClientConfigSummary> {
    const config = this.normalizeConfig(input.service, input);
    await this.store.set(config);
    return this.toSummary(input.service, this.getOAuthDefinition(input.service), config);
  }

  normalizeConfig(service: string, input: OAuthClientConfigInput): OAuthClientConfig {
    const auth = this.getOAuthDefinition(service);
    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret.trim();
    if (!clientId) {
      throw new OAuthClientConfigError("invalid_input", "clientId is required.");
    }
    if (!clientSecret && requiresOAuthClientSecret(auth)) {
      throw new OAuthClientConfigError("invalid_input", "clientSecret is required.");
    }

    const submittedExtra = input.extra ?? {};
    const config: OAuthClientConfig = {
      service,
      clientId,
      clientSecret,
      requestedScopes: normalizeRequestedScopes(service, input.requestedScopes, auth.scopes),
      extra: normalizeCredentialValues({
        fields: filterClientConfigFields(auth.clientConfigFields, "extra"),
        values: pickClientConfigFieldValues(auth.clientConfigFields, submittedExtra, "extra"),
        createError: (message) => new OAuthClientConfigError("invalid_input", message),
      }),
      secretExtra: normalizeCredentialValues({
        fields: filterClientConfigFields(auth.clientConfigFields, "secretExtra"),
        values: {
          ...pickClientConfigFieldValues(auth.clientConfigFields, submittedExtra, "secretExtra"),
          ...(input.secretExtra ?? {}),
        },
        createError: (message) => new OAuthClientConfigError("invalid_input", message),
      }),
    };
    assertNoUnexpectedClientConfigFields(auth.clientConfigFields, submittedExtra, input.secretExtra ?? {});
    return config;
  }

  async deleteConfig(service: string): Promise<{ service: string; configured: false }> {
    this.getOAuthDefinition(service);
    await this.store.delete(service);
    return { service, configured: false };
  }

  expectedRedirectUri(service: string): string {
    this.getOAuthDefinition(service);
    return `${this.origin}${OAuthClientConfigService.callbackPath}`;
  }

  resolveEndpointUrl(service: string, endpointUrl: string, config: OAuthClientConfig): string {
    this.getOAuthDefinition(service);
    const resolved = endpointUrl.replaceAll(/\{(\+?)([A-Za-z0-9_]+)\}/g, (_match, rawModifier: string, key: string) => {
      const value = config.extra[key];
      if (!value) {
        throw new OAuthClientConfigError("invalid_input", `${key} is required.`);
      }
      return rawModifier === "+" ? value.replace(/\/+$/, "") : encodeURIComponent(value);
    });
    assertOAuthEndpointUrl(resolved);
    return resolved;
  }

  getOAuthDefinition(service: string): OAuthAuthDefinition {
    const provider = this.catalog.providers.find((provider) => provider.service === service);
    if (!provider) {
      throw new OAuthClientConfigError("unknown_service", `Unknown service: ${service}.`);
    }

    const auth = provider.auth.find(isOAuthAuthDefinition);
    if (!auth) {
      throw new OAuthClientConfigError("unsupported_auth_type", `${service} does not support OAuth.`);
    }

    return auth;
  }

  /** Resolve the scopes an authorization request should send. */
  getEffectiveScopes(service: string, config: OAuthClientConfig): string[] {
    const auth = this.getOAuthDefinition(service);
    return filterDeclaredScopes(config.requestedScopes, auth.scopes) ?? [...auth.scopes];
  }

  private listOAuthProviders(): Array<{ service: string; auth: OAuthAuthDefinition }> {
    return this.catalog.providers.flatMap((provider) => {
      const auth = provider.auth.find(isOAuthAuthDefinition);
      return auth ? [{ service: provider.service, auth }] : [];
    });
  }

  private toSummary(
    service: string,
    auth: OAuthAuthDefinition,
    config: OAuthClientConfig | undefined,
  ): OAuthClientConfigSummary {
    return {
      service,
      configured: config != null,
      customClientAvailable: this.isCustomClientConfigAvailable(service),
      clientId: config?.clientId ?? null,
      expectedRedirectUri: this.expectedRedirectUri(service),
      auth,
      requestedScopes: config?.requestedScopes ?? null,
      effectiveScopes: filterDeclaredScopes(config?.requestedScopes, auth.scopes) ?? [...auth.scopes],
      extra: config?.extra ?? {},
    };
  }
}

function requiresOAuthClientSecret(auth: OAuthAuthDefinition): boolean {
  return auth.type === "oauth1" || auth.tokenEndpointAuthMethod !== "none";
}

function isOAuthAuthDefinition(auth: ProviderAuthDefinition): auth is OAuthAuthDefinition {
  return auth.type === "oauth1" || auth.type === "oauth2";
}

/** Read a connection-scoped OAuth client config stored in credential metadata. */
export function readOAuthClientConfigMetadata(
  service: string,
  metadata: Record<string, unknown>,
): OAuthClientConfig | undefined {
  const value = optionalRecord(metadata.oauthClientConfig);
  const clientId = optionalString(value?.clientId);
  if (!clientId) {
    return undefined;
  }

  return {
    service,
    clientId,
    clientSecret: optionalString(value?.clientSecret) ?? "",
    requestedScopes: optionalStringArray(value?.requestedScopes),
    extra: readStringRecord(value?.extra),
    secretExtra: readStringRecord(value?.secretExtra),
  };
}

/**
 * Error with a stable code suitable for HTTP responses.
 */
export class OAuthClientConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function filterClientConfigFields(
  fields: OAuthClientConfigFieldDefinition[] | undefined,
  location: "extra" | "secretExtra",
): OAuthClientConfigFieldDefinition[] {
  return (fields ?? []).filter((field) => (field.location ?? "extra") === location);
}

function pickClientConfigFieldValues(
  fields: OAuthClientConfigFieldDefinition[] | undefined,
  values: Record<string, unknown>,
  location: "extra" | "secretExtra",
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of filterClientConfigFields(fields, location)) {
    output[field.key] = values[field.key] ?? field.defaultValue;
  }
  return output;
}

function assertNoUnexpectedClientConfigFields(
  fields: OAuthClientConfigFieldDefinition[] | undefined,
  extra: Record<string, unknown>,
  secretExtra: Record<string, unknown>,
): void {
  const keys = new Set((fields ?? []).map((field) => field.key));
  for (const key of [...Object.keys(extra), ...Object.keys(secretExtra)]) {
    if (!keys.has(key)) {
      throw new OAuthClientConfigError("invalid_input", `Unexpected credential field: ${key}.`);
    }
  }
}

function normalizeStoredOAuthClientConfig(config: OAuthClientConfig | undefined): OAuthClientConfig | undefined {
  if (!config) {
    return undefined;
  }

  return {
    ...config,
    secretExtra: config.secretExtra ?? {},
  };
}

function normalizeRequestedScopes(
  service: string,
  requestedScopes: string[] | undefined,
  providerScopes: string[],
): string[] | undefined {
  if (requestedScopes === undefined) {
    return undefined;
  }
  if (!Array.isArray(requestedScopes) || requestedScopes.some((scope) => typeof scope !== "string")) {
    throw new OAuthClientConfigError("invalid_input", "requestedScopes must be an array of strings.");
  }

  const normalized = [...new Set(requestedScopes.map((scope) => scope.trim()))];
  if (normalized.length === 0) {
    throw new OAuthClientConfigError("invalid_input", "requestedScopes must contain at least one scope.");
  }
  if (normalized.some((scope) => !scope)) {
    throw new OAuthClientConfigError("invalid_input", "requestedScopes must not contain empty values.");
  }

  const declaredScopes = new Set(providerScopes);
  const undeclaredScope = normalized.find((scope) => !declaredScopes.has(scope));
  if (undeclaredScope) {
    throw new OAuthClientConfigError(
      "invalid_input",
      `requestedScopes contains a scope not declared by ${service}: ${undeclaredScope}.`,
    );
  }

  return normalized;
}

/**
 * Resolve stored requested scopes against the currently declared provider
 * scopes. A provider can stop declaring a scope after configs were saved (for
 * example when the platform restricts who may request it); rejecting the stored
 * value would break the config listing and every re-authorization, so read
 * paths drop undeclared scopes and fall back to the provider defaults when none
 * survive. Writes stay strict via normalizeRequestedScopes.
 */
function filterDeclaredScopes(requestedScopes: string[] | undefined, providerScopes: string[]): string[] | undefined {
  if (requestedScopes === undefined) {
    return undefined;
  }

  const declaredScopes = new Set(providerScopes);
  const filtered = [...new Set(requestedScopes.map((scope) => scope.trim()))].filter((scope) =>
    declaredScopes.has(scope),
  );
  return filtered.length > 0 ? filtered : undefined;
}

function readStringRecord(value: unknown): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).flatMap(([key, item]) => {
      const normalized = optionalString(item);
      return normalized ? [[key, normalized]] : [];
    }),
  );
}

function assertOAuthEndpointUrl(value: string): void {
  const url = assertPublicHttpUrl(value, {
    fieldName: "OAuth endpoint URL",
    createError: (message) => new OAuthClientConfigError("invalid_input", message),
  });
  if (url.protocol !== "https:") {
    throw new OAuthClientConfigError("invalid_input", "OAuth endpoint URL must use https.");
  }
}
