import type { CatalogStore, RuntimeProviderDefinition } from "./catalog-store.ts";
import type {
  ApiKeyAuthDefinition,
  AuthType,
  CredentialDefinition,
  CredentialProfile,
  CredentialValidationResult,
  CustomCredentialAuthDefinition,
  ProviderDefinition,
  ResolvedCredential,
  RuntimeLogger,
} from "./core/types.ts";
import type { IOAuthCredentialRefresher } from "./oauth/oauth-credential-refresh-service.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";

import { normalizeCredentialValues } from "./core/credential-fields.ts";
import { providerFetch } from "./providers/provider-runtime.ts";

export const defaultConnectionName = "default";

/**
 * Connection summary returned to the local console.
 */
export interface ConnectionSummary {
  id: string;
  service: string;
  connectionName: string;
  authType: AuthType;
  configured: boolean;
  virtual: boolean;
  default: boolean;
  profile: CredentialProfile;
}

/**
 * Request body for local credential connections.
 */
export interface ConnectWithCredentialInput {
  connectionName?: string;
  values?: Record<string, unknown>;
}

export interface ConnectWithoutAuthInput {
  connectionName?: string;
}

export interface ConnectionServiceOptions {
  catalog: CatalogStore;
  oauthCredentials?: IOAuthCredentialRefresher;
  providerLoader: IProviderLoader;
  store: IConnectionStore;
  logger?: RuntimeLogger;
}

export interface StoredConnection {
  service: string;
  connectionName: string;
  credential: ResolvedCredential;
}

export interface DisconnectedConnectionSummary {
  service: string;
  connectionName: string;
  configured: false;
}

/**
 * Storage contract for local provider connections.
 */
export interface IConnectionStore {
  get(service: string, connectionName: string): Promise<ResolvedCredential | undefined>;
  set(service: string, connectionName: string, credential: ResolvedCredential): Promise<void>;
  delete(service: string, connectionName: string): Promise<void>;
  list(): Promise<StoredConnection[]>;
}

interface ServiceConnection {
  connectionName: string;
  credential: ResolvedCredential;
}

interface ApiKeyCredentialValidationInput {
  apiKey: string;
  values: Record<string, string>;
}

interface CustomCredentialValidationInput {
  values: Record<string, string>;
}

interface CredentialRuntimeData {
  profile: CredentialProfile;
  metadata: Record<string, unknown>;
}

interface PreviousCredentialRuntimeData {
  profile: CredentialProfile;
  metadata: Record<string, unknown>;
}

type CredentialValidatorCall = () => Promise<CredentialValidationResult | void> | undefined;

/**
 * Coordinates local provider connection state.
 *
 * No-auth providers are treated as virtual connections so open-source users can
 * run public actions without configuration.
 */
export class ConnectionService {
  private readonly catalog: CatalogStore;
  private readonly oauthCredentials?: IOAuthCredentialRefresher;
  private readonly providerLoader: IProviderLoader;
  private readonly store: IConnectionStore;
  private readonly logger?: RuntimeLogger;

  constructor(input: ConnectionServiceOptions) {
    this.catalog = input.catalog;
    this.oauthCredentials = input.oauthCredentials;
    this.providerLoader = input.providerLoader;
    this.store = input.store;
    this.logger = input.logger;
  }

  async listConnections(): Promise<ConnectionSummary[]> {
    const configured = await this.store.list();
    const configuredByService = new Map<string, ServiceConnection[]>();
    for (const connection of configured) {
      const serviceConnections = configuredByService.get(connection.service) ?? [];
      serviceConnections.push({
        connectionName: connection.connectionName,
        credential: connection.credential,
      });
      configuredByService.set(connection.service, serviceConnections);
    }

    return this.catalog.providers.flatMap((provider) => {
      const connections = configuredByService.get(provider.service) ?? [];
      if (connections.length > 0) {
        return connections.map((connection) =>
          this.createConfiguredConnectionSummary(provider, connection.connectionName, connection.credential),
        );
      }

      return this.supportsAuth(provider, "no_auth")
        ? [this.createNoAuthConnectionSummary(provider, defaultConnectionName)]
        : [];
    });
  }

  async listConnectionsByService(service: string): Promise<ConnectionSummary[]> {
    const provider = this.getProvider(service);
    const connections = (await this.store.list()).filter((connection) => connection.service === service);
    if (connections.length > 0) {
      return connections.map((connection) =>
        this.createConfiguredConnectionSummary(provider, connection.connectionName, connection.credential),
      );
    }

    return this.supportsAuth(provider, "no_auth")
      ? [this.createNoAuthConnectionSummary(provider, defaultConnectionName)]
      : [];
  }

  async listAuthenticatedServices(services: string[]): Promise<string[]> {
    const configured = await this.store.list();
    const authenticated = new Set(
      configured
        .filter((connection) => connection.credential.authType !== "no_auth")
        .map((connection) => connection.service),
    );
    return services.filter((service) => authenticated.has(service));
  }

  async getConnectionSummary(service: string, connectionName?: string): Promise<ConnectionSummary | undefined> {
    const provider = this.getProvider(service);
    const name = normalizeConnectionName(connectionName);
    const stored = await this.store.get(service, name);
    if (!stored && connectionName && !this.supportsAuth(provider, "no_auth")) {
      throw new ConnectionError("connection_not_found", `${service} connection not found: ${name}.`);
    }

    return stored
      ? this.createConfiguredConnectionSummary(provider, name, stored)
      : this.supportsAuth(provider, "no_auth")
        ? this.createNoAuthConnectionSummary(provider, name)
        : undefined;
  }

  async getCredential(service: string, connectionName?: string): Promise<ResolvedCredential | undefined> {
    const provider = this.getProvider(service);
    const name = normalizeConnectionName(connectionName);
    const stored = await this.store.get(service, name);
    if (stored) {
      return stored.authType === "oauth2" ? await this.resolveOAuthCredential(service, name, stored) : stored;
    }

    if (connectionName && !this.supportsAuth(provider, "no_auth")) {
      throw new ConnectionError("connection_not_found", `${service} connection not found: ${name}.`);
    }

    return this.supportsAuth(provider, "no_auth") ? { authType: "no_auth" } : undefined;
  }

  forConnection(connectionName?: string): Pick<ConnectionService, "getCredential"> {
    return {
      getCredential: (service: string) => this.getCredential(service, connectionName),
    };
  }

  async connectWithoutAuth(service: string, input: ConnectWithoutAuthInput = {}): Promise<ConnectionSummary> {
    const provider = this.getAvailableProvider(service);
    if (!this.supportsAuth(provider, "no_auth")) {
      throw new ConnectionError("unsupported_auth_type", `${service} does not support no_auth.`);
    }

    return this.createNoAuthConnectionSummary(provider, normalizeConnectionName(input.connectionName));
  }

  async connectWithApiKey(service: string, input: ConnectWithCredentialInput): Promise<ConnectionSummary> {
    const provider = this.getAvailableProvider(service);
    if (!this.supportsAuth(provider, "api_key")) {
      throw new ConnectionError("unsupported_auth_type", `${service} does not support api_key.`);
    }

    const auth = this.getApiKeyDefinition(provider);
    const values = normalizeCredentialValues({
      fields: createApiKeyFields(auth),
      values: input.values ?? {},
      createError: (message) => new ConnectionError("invalid_input", message),
    });
    const apiKey = values.apiKey;

    const credential: ResolvedCredential = {
      authType: "api_key",
      apiKey,
      values,
      ...this.buildCredentialRuntimeData(
        provider,
        "api_key",
        createApiKeyFields(auth),
        values,
        await this.validateApiKeyCredential(service, { apiKey, values }),
      ),
    };
    const connectionName = normalizeConnectionName(input.connectionName);
    await this.store.set(service, connectionName, credential);

    return this.createStoredConnectionSummary(provider, connectionName, credential);
  }

  async connectWithCustomCredential(service: string, input: ConnectWithCredentialInput): Promise<ConnectionSummary> {
    const provider = this.getAvailableProvider(service);
    if (!this.supportsAuth(provider, "custom_credential")) {
      throw new ConnectionError("unsupported_auth_type", `${service} does not support custom_credential.`);
    }

    const auth = this.getCustomCredentialDefinition(provider);
    const values = normalizeCredentialValues({
      fields: auth.fields,
      values: input.values ?? {},
      createError: (message) => new ConnectionError("invalid_input", message),
    });
    const credential: ResolvedCredential = {
      authType: "custom_credential",
      values,
      ...this.buildCredentialRuntimeData(
        provider,
        "custom_credential",
        auth.fields,
        values,
        await this.validateCustomCredential(service, { values }),
      ),
    };
    const connectionName = normalizeConnectionName(input.connectionName);
    await this.store.set(service, connectionName, credential);

    return this.createStoredConnectionSummary(provider, connectionName, credential);
  }

  async setOAuthCredential(
    service: string,
    credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
    connectionNameInput?: string,
  ): Promise<ConnectionSummary> {
    const provider = this.getAvailableProvider(service);
    if (!this.supportsAuth(provider, "oauth2")) {
      throw new ConnectionError("unsupported_auth_type", `${service} does not support oauth2.`);
    }

    const connectionName = normalizeConnectionName(connectionNameInput);
    let validation: CredentialValidationResult = {};
    try {
      validation = await this.validateOAuthCredential(service, credential);
    } catch (error) {
      if (!(error instanceof ConnectionError && error.code === "credential_verification_failed")) {
        throw error;
      }
    }
    const storedCredential = {
      ...credential,
      ...this.mergeCredentialRuntimeData(provider, "oauth2", credential, validation),
    };
    await this.store.set(service, connectionName, storedCredential);
    return this.createStoredConnectionSummary(provider, connectionName, storedCredential);
  }

  async disconnect(
    service: string,
    connectionNameInput?: string,
  ): Promise<ConnectionSummary | DisconnectedConnectionSummary> {
    const connectionName = normalizeConnectionName(connectionNameInput);
    await this.store.delete(service, connectionName);
    const provider = this.catalog.providers.find((provider) => provider.service === service);
    if (provider && this.supportsAuth(provider, "no_auth")) {
      return this.connectWithoutAuth(service, { connectionName });
    }

    return { service, connectionName, configured: false };
  }

  private createConfiguredConnectionSummary(
    provider: ProviderDefinition,
    connectionName: string,
    credential: ResolvedCredential,
  ): ConnectionSummary {
    return credential.authType === "no_auth"
      ? this.createNoAuthConnectionSummary(provider, connectionName)
      : this.createStoredConnectionSummary(provider, connectionName, credential);
  }

  private createStoredConnectionSummary(
    provider: ProviderDefinition,
    connectionName: string,
    credential: Exclude<ResolvedCredential, { authType: "no_auth" }>,
  ): ConnectionSummary {
    return {
      id: createConnectionId(provider.service, connectionName),
      service: provider.service,
      connectionName,
      authType: credential.authType,
      configured: true,
      virtual: false,
      default: connectionName === defaultConnectionName,
      profile: credential.profile,
    };
  }

  private createNoAuthConnectionSummary(provider: ProviderDefinition, connectionName: string): ConnectionSummary {
    return {
      id: createConnectionId(provider.service, connectionName),
      service: provider.service,
      connectionName,
      authType: "no_auth",
      configured: true,
      virtual: true,
      default: connectionName === defaultConnectionName,
      profile: this.createNoAuthProfile(provider),
    };
  }

  /** Rejects provider setup when none of its catalog actions can execute in this runtime. */
  assertProviderAvailable(service: string): void {
    this.getAvailableProvider(service);
  }

  private getProvider(service: string): RuntimeProviderDefinition {
    const provider = this.catalog.providers.find((provider) => provider.service === service);
    if (!provider) {
      throw new ConnectionError("unknown_service", `Unknown service: ${service}.`);
    }

    return provider;
  }

  private getAvailableProvider(service: string): RuntimeProviderDefinition {
    const provider = this.getProvider(service);
    if (provider.actions.length > 0 && provider.execution.locallyExecutableActionCount === 0) {
      throw new ConnectionError("provider_unavailable", `${provider.displayName} is not available in this runtime.`);
    }

    return provider;
  }

  private supportsAuth(provider: ProviderDefinition, authType: AuthType): boolean {
    return provider.authTypes.includes(authType);
  }

  private getApiKeyDefinition(provider: ProviderDefinition): ApiKeyAuthDefinition {
    const auth = provider.auth.find((auth) => auth.type === "api_key");
    if (!auth || auth.type !== "api_key") {
      throw new ConnectionError("unsupported_auth_type", `${provider.service} does not support api_key.`);
    }

    return auth;
  }

  private getCustomCredentialDefinition(provider: ProviderDefinition): CustomCredentialAuthDefinition {
    const auth = provider.auth.find((auth) => auth.type === "custom_credential");
    if (!auth || auth.type !== "custom_credential") {
      throw new ConnectionError("unsupported_auth_type", `${provider.service} does not support custom_credential.`);
    }

    return auth;
  }

  private async validateApiKeyCredential(
    service: string,
    input: ApiKeyCredentialValidationInput,
  ): Promise<CredentialValidationResult> {
    const validators = await this.providerLoader.loadCredentialValidators(service);
    return this.runCredentialValidator(service, () => validators?.apiKey?.(input, this.createValidatorOptions()));
  }

  private async validateCustomCredential(
    service: string,
    input: CustomCredentialValidationInput,
  ): Promise<CredentialValidationResult> {
    const validators = await this.providerLoader.loadCredentialValidators(service);
    return this.runCredentialValidator(service, () =>
      validators?.customCredential?.(input, this.createValidatorOptions()),
    );
  }

  private async validateOAuthCredential(
    service: string,
    credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  ): Promise<CredentialValidationResult> {
    const validators = await this.providerLoader.loadCredentialValidators(service);
    return this.runCredentialValidator(service, () => validators?.oauth2?.(credential, this.createValidatorOptions()));
  }

  private createValidatorOptions() {
    return {
      fetcher: providerFetch,
      logger: this.logger,
    };
  }

  private async resolveOAuthCredential(
    service: string,
    connectionName: string,
    credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  ): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
    if (!isOAuthCredentialExpired(credential)) {
      return credential;
    }

    if (!credential.refreshToken) {
      throw new ConnectionError(
        "oauth_token_expired",
        `${service} OAuth access token expired and no refresh token is available. Reconnect ${service}.`,
      );
    }

    if (!this.oauthCredentials) {
      throw new ConnectionError(
        "oauth_refresh_unavailable",
        `${service} OAuth access token expired and this runtime cannot refresh it.`,
      );
    }

    const nextCredential = await this.oauthCredentials.refresh(service, credential);
    await this.store.set(service, connectionName, nextCredential);
    return nextCredential;
  }

  private async runCredentialValidator(
    service: string,
    validate: CredentialValidatorCall,
  ): Promise<CredentialValidationResult> {
    try {
      return (await validate()) ?? {};
    } catch (error) {
      throw new ConnectionError(
        "credential_verification_failed",
        error instanceof Error ? error.message : `${service} credential verification failed.`,
      );
    }
  }

  private buildCredentialRuntimeData(
    provider: ProviderDefinition,
    authType: Exclude<AuthType, "no_auth">,
    credentialFields: CredentialDefinition[],
    credentialValues: Record<string, string>,
    validation: CredentialValidationResult,
  ): CredentialRuntimeData {
    return {
      profile: this.createCredentialProfile(provider, authType, credentialFields, credentialValues, validation),
      metadata: validation.metadata ?? {},
    };
  }

  private mergeCredentialRuntimeData(
    provider: ProviderDefinition,
    authType: Exclude<AuthType, "no_auth">,
    credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
    validation: CredentialValidationResult,
  ): CredentialRuntimeData {
    return {
      profile: this.createCredentialProfile(provider, authType, [], {}, validation, {
        profile: credential.profile,
        metadata: credential.metadata,
      }),
      metadata: {
        ...credential.metadata,
        ...(validation.metadata ?? {}),
      },
    };
  }

  private createCredentialProfile(
    provider: ProviderDefinition,
    authType: Exclude<AuthType, "no_auth">,
    credentialFields: CredentialDefinition[],
    credentialValues: Record<string, string>,
    validation: CredentialValidationResult,
    previous?: PreviousCredentialRuntimeData,
  ): CredentialProfile {
    const accountId =
      validation.profile?.accountId ??
      readLegacyString(validation.metadata, "providerAccountId") ??
      readLegacyString(validation.metadata, "accountId") ??
      previous?.profile.accountId ??
      this.createDefaultAccountId(provider, authType, credentialFields, credentialValues);
    const displayName =
      validation.profile?.displayName ??
      readLegacyString(validation.metadata, "accountLabel") ??
      readLegacyString(validation.metadata, "displayName") ??
      previous?.profile.displayName ??
      this.createDefaultDisplayName(provider, authType);

    const grantedScopes =
      validation.profile?.grantedScopes ??
      validation.grantedScopes ??
      parseScopeString(readLegacyString(validation.metadata, "scope")) ??
      parseScopeString(readLegacyString(previous?.metadata, "scope")) ??
      previous?.profile.grantedScopes;

    return {
      accountId,
      displayName,
      grantedScopes: normalizeGrantedScopes(grantedScopes),
    };
  }

  private createNoAuthProfile(provider: ProviderDefinition): CredentialProfile {
    return {
      accountId: `${provider.service}:public`,
      displayName: `${provider.displayName} Public`,
      grantedScopes: [],
    };
  }

  private createDefaultAccountId(
    provider: ProviderDefinition,
    authType: Exclude<AuthType, "no_auth">,
    credentialFields: CredentialDefinition[],
    credentialValues: Record<string, string>,
  ): string {
    const publicFields = new Set(credentialFields.filter((field) => !field.secret).map((field) => field.key));
    const visibleValues = Object.entries(credentialValues)
      .filter(([key]) => publicFields.has(key))
      .map(([key, value]) => `${key}:${value}`);
    return visibleValues.length > 0
      ? `${provider.service}:${visibleValues.join(":")}`
      : `${provider.service}:${authType}`;
  }

  private createDefaultDisplayName(provider: ProviderDefinition, authType: Exclude<AuthType, "no_auth">): string {
    return `${provider.displayName} ${authType === "api_key" ? "API Key" : "Credential"}`;
  }
}

function isOAuthCredentialExpired(credential: Extract<ResolvedCredential, { authType: "oauth2" }>): boolean {
  if (!credential.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(credential.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000;
}

function createApiKeyFields(auth: ApiKeyAuthDefinition): CredentialDefinition[] {
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

export function normalizeConnectionName(value: string | undefined): string {
  const name = value?.trim() || defaultConnectionName;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) {
    throw new ConnectionError(
      "invalid_connection_name",
      "connectionName must start with a letter or digit and contain only letters, digits, underscores, or hyphens.",
    );
  }

  return name;
}

function createConnectionId(service: string, connectionName: string): string {
  return `${service}:${connectionName}`;
}

function normalizeGrantedScopes(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function parseScopeString(value: string | undefined): string[] | undefined {
  return value ? value.split(/[,\s]+/) : undefined;
}

function readLegacyString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Error with a stable code suitable for HTTP responses.
 */
export class ConnectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
