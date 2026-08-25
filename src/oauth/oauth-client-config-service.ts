import type { CatalogStore } from "../catalog-store.ts";
import type { OAuth2AuthDefinition, OAuthClientConfigFieldDefinition } from "../core/types.ts";

import { optionalRecord, optionalString, optionalStringArray } from "../core/cast.ts";
import { normalizeCredentialValues } from "../core/credential-fields.ts";
import { assertPublicHttpUrl } from "../core/request.ts";
import { registerDynamicOAuthClient } from "./oauth-dynamic-registration.ts";

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
  /** Whether the runtime will auto-register a public OAuth client on the first authorization attempt. */
  autoRegisters: boolean;
  customClientAvailable: boolean;
  clientId: string | null;
  expectedRedirectUri: string;
  auth: OAuth2AuthDefinition;
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
  /** Per-service in-flight dynamic registrations, so concurrent first authorizations share one client. */
  private readonly pendingRegistrations = new Map<string, Promise<OAuthClientConfig>>();

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
    const auth = this.getOAuthDefinition(service);
    const stored = normalizeStoredOAuthClientConfig(await this.store.get(service));
    if (stored) {
      return stored;
    }
    if (!autoRegisters(auth)) {
      return undefined;
    }

    const pending = this.pendingRegistrations.get(service);
    if (pending) {
      return pending;
    }
    const registration = (async () => {
      // Re-read inside the single flight: a concurrent caller may have
      // registered and stored a client between our first read and now.
      const existing = normalizeStoredOAuthClientConfig(await this.store.get(service));
      if (existing) {
        return existing;
      }
      const config = await this.registerConfig(service, auth);
      await this.store.set(config);
      return config;
    })();
    this.pendingRegistrations.set(service, registration);
    try {
      return await registration;
    } finally {
      this.pendingRegistrations.delete(service);
    }
  }

  private async registerConfig(service: string, auth: OAuth2AuthDefinition): Promise<OAuthClientConfig> {
    assertOAuthEndpointUrl(auth.registrationEndpoint!);
    const registered = await registerDynamicOAuthClient({
      registrationEndpoint: auth.registrationEndpoint!,
      redirectUri: this.expectedRedirectUri(service),
      clientName: `OpenConnector (${this.origin})`,
      createError: (message) => new OAuthClientConfigError("oauth_dynamic_registration_failed", message),
    });
    return {
      service,
      clientId: registered.clientId,
      clientSecret: registered.clientSecret ?? "",
      extra: {},
      secretExtra: {},
    };
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
    if (!clientSecret && auth.tokenEndpointAuthMethod !== "none") {
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

  getOAuthDefinition(service: string): OAuth2AuthDefinition {
    const provider = this.catalog.providers.find((provider) => provider.service === service);
    if (!provider) {
      throw new OAuthClientConfigError("unknown_service", `Unknown service: ${service}.`);
    }

    const auth = provider.auth.find((auth) => auth.type === "oauth2");
    if (!auth || auth.type !== "oauth2") {
      throw new OAuthClientConfigError("unsupported_auth_type", `${service} does not support oauth2.`);
    }

    return auth;
  }

  /** Resolve the scopes an authorization request should send. */
  getEffectiveScopes(service: string, config: OAuthClientConfig): string[] {
    const auth = this.getOAuthDefinition(service);
    return filterDeclaredScopes(config.requestedScopes, auth.scopes) ?? [...auth.scopes];
  }

  private listOAuthProviders(): Array<{ service: string; auth: OAuth2AuthDefinition }> {
    return this.catalog.providers.flatMap((provider) => {
      const auth = provider.auth.find((auth) => auth.type === "oauth2");
      return auth && auth.type === "oauth2" ? [{ service: provider.service, auth }] : [];
    });
  }

  private toSummary(
    service: string,
    auth: OAuth2AuthDefinition,
    config: OAuthClientConfig | undefined,
  ): OAuthClientConfigSummary {
    return {
      service,
      configured: config != null,
      autoRegisters: autoRegisters(auth),
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

function autoRegisters(auth: OAuth2AuthDefinition): boolean {
  return Boolean(auth.registrationEndpoint) && auth.tokenEndpointAuthMethod === "none";
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
