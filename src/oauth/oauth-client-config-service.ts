import type { CatalogStore } from "../catalog-store.ts";
import type { OAuth2AuthDefinition, OAuthClientConfigFieldDefinition } from "../core/types.ts";

import { normalizeCredentialValues } from "../core/credential-fields.ts";
import { assertPublicHttpUrl } from "../core/request.ts";

/**
 * OAuth client configuration supplied by an open-source runtime user.
 */
export type OAuthClientConfig = {
  service: string;
  clientId: string;
  clientSecret: string;
  extra: Record<string, string>;
  secretExtra: Record<string, string>;
};

/**
 * OAuth client config summary safe to return to the local console.
 */
export type OAuthClientConfigSummary = {
  service: string;
  configured: boolean;
  clientId: string | null;
  expectedRedirectUri: string;
  auth: OAuth2AuthDefinition;
};

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

  constructor(input: { catalog: CatalogStore; origin: string; store: IOAuthClientConfigStore }) {
    this.catalog = input.catalog;
    this.origin = input.origin.replace(/\/$/, "");
    this.store = input.store;
  }

  async listConfigs(): Promise<OAuthClientConfigSummary[]> {
    const configured = new Map((await this.store.list()).map((config) => [config.service, config]));
    return this.listOAuthProviders().map((provider) =>
      this.toSummary(provider.service, provider.auth, configured.get(provider.service)),
    );
  }

  async getConfig(service: string): Promise<OAuthClientConfig | undefined> {
    this.getOAuthDefinition(service);
    return normalizeStoredOAuthClientConfig(await this.store.get(service));
  }

  async upsertConfig(input: {
    service: string;
    clientId: string;
    clientSecret: string;
    extra?: Record<string, unknown>;
    secretExtra?: Record<string, unknown>;
  }): Promise<OAuthClientConfigSummary> {
    const auth = this.getOAuthDefinition(input.service);
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
      service: input.service,
      clientId,
      clientSecret,
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
    await this.store.set(config);
    return this.toSummary(input.service, auth, config);
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
      clientId: config?.clientId ?? null,
      expectedRedirectUri: this.expectedRedirectUri(service),
      auth,
    };
  }
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

function assertOAuthEndpointUrl(value: string): void {
  const url = assertPublicHttpUrl(value, {
    fieldName: "OAuth endpoint URL",
    createError: (message) => new OAuthClientConfigError("invalid_input", message),
  });
  if (url.protocol !== "https:") {
    throw new OAuthClientConfigError("invalid_input", "OAuth endpoint URL must use https.");
  }
}
