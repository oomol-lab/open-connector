import type { StoredConnection, ConnectionService } from "../connection-service.ts";
import type { OAuth2AuthDefinition } from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";
import type {
  ConnectionRequestStore,
  PendingConnectionRequest,
  ConnectionRequest,
} from "../server/storage/connection-request-store.ts";
import type {
  OAuthClientConfig,
  OAuthClientConfigInput,
  OAuthClientConfigService,
} from "./oauth-client-config-service.ts";
import type { OAuthTokenResult } from "./oauth-token.ts";

import { createHash, randomBytes } from "node:crypto";
import { ConnectionError } from "../connection-service.ts";
import { providerFetch } from "../providers/provider-runtime.ts";
import { requestAuthorizationCodeToken } from "./oauth-token.ts";

/**
 * Started OAuth authorization flow returned to the local console.
 */
export type OAuthAuthorizationStart = {
  authorizationUrl: string;
  state: string;
};

export interface OAuthAuthorizationStartInput {
  service: string;
  connectionName?: string;
  clientConfig?: OAuthClientConfigInput;
  authorizationOptionIds?: string[];
}

export interface OAuthAuthorizationCompleteInput {
  state: string;
  code: string;
  callbackParameters?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Short-lived OAuth state stored while the browser completes authorization.
 */
export interface OAuthAuthorizationState {
  service: string;
  connectionName?: string;
  state: string;
  createdAt: string;
  pkceCodeVerifier?: string;
  authorizationScopes?: string[];
  clientConfig?: OAuthClientConfig;
}

export interface OAuthFlowServiceOptions {
  clientConfigs: OAuthClientConfigService;
  connections: ConnectionService;
  providerLoader: IProviderLoader;
  states: IOAuthStateStore;
  requests: ConnectionRequestStore;
  stateMaxAgeMs?: number;
  secretCodec?: ISecretCodec;
  isCustomClientConfigAllowed?: (service: string) => boolean;
}

/**
 * Storage contract for pending OAuth authorization states.
 */
export interface IOAuthStateStore {
  /** Deletes states whose creation timestamp is earlier than the cutoff. */
  deleteCreatedBefore(cutoff: string): Promise<void>;
  set(state: OAuthAuthorizationState): Promise<void>;
  take(state: string): Promise<OAuthAuthorizationState | undefined>;
}

/**
 * Coordinates runtime OAuth authorization and token exchange.
 */
export class OAuthFlowService {
  private readonly clientConfigs: OAuthClientConfigService;
  private readonly connections: ConnectionService;
  private readonly providerLoader: IProviderLoader;
  private readonly states: IOAuthStateStore;
  private readonly requests: ConnectionRequestStore;
  private readonly stateMaxAgeMs: number;
  private readonly secretCodec?: ISecretCodec;
  private readonly isCustomClientConfigAllowed: (service: string) => boolean;

  constructor(input: OAuthFlowServiceOptions) {
    this.clientConfigs = input.clientConfigs;
    this.connections = input.connections;
    this.providerLoader = input.providerLoader;
    this.states = input.states;
    this.requests = input.requests;
    this.stateMaxAgeMs = input.stateMaxAgeMs ?? 15 * 60 * 1000;
    this.secretCodec = input.secretCodec;
    this.isCustomClientConfigAllowed = input.isCustomClientConfigAllowed ?? (() => false);
  }

  async startAuthorization(input: OAuthAuthorizationStartInput): Promise<OAuthAuthorizationStart> {
    const { pending, authorizationUrl } = await this.prepareAuthorization(input);
    await this.states.deleteCreatedBefore(new Date(Date.now() - this.stateMaxAgeMs).toISOString());
    await this.states.set(pending);
    return { authorizationUrl, state: pending.state };
  }

  async startConnectionRequest(input: OAuthConnectionRequestInput): Promise<OAuthConnectionRequestStart> {
    validateReturnUri(input.returnUri);
    const auth = this.clientConfigs.getOAuthDefinition(input.service);
    let requestedScopes: string[] | undefined;
    if (input.authorizationOptionIds !== undefined) {
      if (!auth.authorizationOptions)
        throw new OAuthFlowError("invalid_input", "This provider does not declare authorization options.");
      const selected = new Set(input.authorizationOptionIds);
      const unknown = [...selected].filter((id) => !auth.authorizationOptions!.some((option) => option.id === id));
      if (unknown.length)
        throw new OAuthFlowError("invalid_input", `Unknown OAuth authorization options: ${unknown.join(", ")}.`);
      requestedScopes = auth.authorizationOptions
        .filter((option) => option.required || selected.has(option.id))
        .map((option) => option.id);
    }
    if (input.target && input.target.credential.authType !== "oauth2") {
      throw new OAuthFlowError("unsupported_auth_type", "This connection does not use OAuth.");
    }
    const configured = await this.clientConfigs.getConfig(input.service);
    if (!configured)
      throw new OAuthFlowError("oauth_client_config_required", `Configure an OAuth client for ${input.service} first.`);
    const config = this.clientConfigs.normalizeConfig(input.service, {
      ...configured,
      requestedScopes: requestedScopes ?? configured.requestedScopes,
      extra: { ...configured.extra, ...input.extra },
      secretExtra: { ...configured.secretExtra, ...input.secretExtra },
    });
    const connectionName = input.target?.connectionName ?? crypto.randomUUID();
    const { pending, authorizationUrl } = await this.prepareAuthorization(
      {
        service: input.service,
        connectionName,
      },
      config,
    );
    const request: PendingConnectionRequest = {
      ...pending,
      connectionName,
      clientConfig: config,
      connectionRequestId: crypto.randomUUID(),
      owner: input.owner,
      expiresAt: new Date(Date.parse(pending.createdAt) + 10 * 60_000).toISOString(),
      returnUri: input.returnUri,
      target: input.target ? { id: input.target.id, revision: input.target.revision } : undefined,
    };
    await this.requests.create(request);
    return {
      authorizationUrl,
      stateHandle: pending.state,
      connectionRequestId: request.connectionRequestId,
      status: "initiated",
      expiresAt: request.expiresAt,
    };
  }

  async getConnectionRequest(id: string, owner: string): Promise<ConnectionRequest | undefined> {
    return this.requests.get(id, owner);
  }

  async rejectAuthorization(state: string, denied: boolean): Promise<string | undefined> {
    const pending = await this.requests.claim(state);
    if (!pending) return undefined;
    await this.requests.fail(
      pending.connectionRequestId,
      denied ? "invalid_input" : "provider_error",
      denied ? "Authorization was denied." : "OAuth connection failed.",
    );
    return callbackReturnUri(
      pending,
      "error",
      denied ? "invalid_input" : "provider_error",
      denied ? "Authorization was denied." : "OAuth connection failed.",
    );
  }

  private async prepareAuthorization(
    input: OAuthAuthorizationStartInput,
    requestConfig?: OAuthClientConfig,
  ): Promise<{ pending: OAuthAuthorizationState; authorizationUrl: string }> {
    const { service, connectionName } = input;
    this.connections.assertProviderAvailable(service);
    const auth = this.clientConfigs.getOAuthDefinition(service);
    const config =
      requestConfig ??
      (input.clientConfig
        ? this.resolveCustomClientConfig(service, input.clientConfig)
        : await this.clientConfigs.getConfig(service));
    if (!config) {
      throw new OAuthFlowError("oauth_client_config_required", `Configure an OAuth client for ${service} first.`);
    }

    const now = new Date();
    const state = crypto.randomUUID();
    const pkceCodeVerifier = auth.pkce ? createPkceCodeVerifier() : undefined;
    const authorizationScopes = resolveAuthorizationScopes(
      auth,
      input.authorizationOptionIds,
      this.clientConfigs.getEffectiveScopes(service, config),
    );
    const pending: OAuthAuthorizationState = {
      service,
      connectionName,
      state,
      createdAt: now.toISOString(),
      pkceCodeVerifier,
      authorizationScopes: auth.authorizationOptions ? authorizationScopes : undefined,
      clientConfig: input.clientConfig ? config : undefined,
    };

    const authorizationUrl = new URL(this.clientConfigs.resolveEndpointUrl(service, auth.authorizationUrl, config));
    for (const [key, value] of Object.entries(auth.authorizationParams ?? {})) {
      authorizationUrl.searchParams.set(key, value);
    }
    setAuthorizationParam(authorizationUrl, auth.authorizationRequestFields?.clientId, "client_id", config.clientId);
    setAuthorizationParam(
      authorizationUrl,
      auth.authorizationRequestFields?.redirectUri,
      "redirect_uri",
      this.clientConfigs.expectedRedirectUri(service),
    );
    setAuthorizationParam(authorizationUrl, auth.authorizationRequestFields?.responseType, "response_type", "code");
    setAuthorizationParam(authorizationUrl, auth.authorizationRequestFields?.state, "state", state);
    if (authorizationScopes.length > 0 && auth.authorizationRequestFields?.scope !== false) {
      authorizationUrl.searchParams.set(
        auth.authorizationRequestFields?.scope ?? "scope",
        authorizationScopes.join(auth.scopeSeparator ?? " "),
      );
    }
    if (pkceCodeVerifier) {
      authorizationUrl.searchParams.set("code_challenge", createPkceCodeChallenge(pkceCodeVerifier));
      authorizationUrl.searchParams.set("code_challenge_method", auth.pkce?.method ?? "S256");
    }

    return {
      authorizationUrl: authorizationUrl.toString(),
      pending,
    };
  }

  async completeAuthorization(
    input: OAuthAuthorizationCompleteInput,
  ): Promise<{ service: string; connected: true; returnUri?: string }> {
    const request = await this.requests.claim(input.state);
    const pending = request ?? (await this.states.take(input.state));
    if (!pending) {
      throw new OAuthFlowError("invalid_oauth_state", "OAuth state is missing or expired.");
    }
    if (!request && isExpiredOAuthState(pending, this.stateMaxAgeMs)) {
      throw new OAuthFlowError("invalid_oauth_state", "OAuth state is missing or expired.");
    }

    try {
      const auth = this.clientConfigs.getOAuthDefinition(pending.service);
      const config = pending.clientConfig ?? (await this.clientConfigs.getConfig(pending.service));
      if (!config) {
        throw new OAuthFlowError(
          "oauth_client_config_required",
          `Configure an OAuth client for ${pending.service} first.`,
        );
      }

      const redirectUri = this.clientConfigs.expectedRedirectUri(pending.service);
      const tokenUrl = this.clientConfigs.resolveEndpointUrl(pending.service, auth.tokenUrl, config);
      const createError = (message: string): OAuthFlowError =>
        new OAuthFlowError("oauth_token_exchange_failed", message);
      const providerOAuth = await this.providerLoader.loadProviderOAuthRuntime?.(pending.service);
      let tokenResponse: OAuthTokenResult;
      if (providerOAuth?.exchangeCode) {
        tokenResponse = await providerOAuth.exchangeCode({
          code: input.code,
          clientConfig: config,
          redirectUri,
          tokenUrl,
          fetcher: providerFetch,
          signal: input.signal,
          createError,
        });
      } else {
        tokenResponse = await requestAuthorizationCodeToken({
          code: input.code,
          state: pending.state,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri,
          responseEnvelope: auth.tokenResponseEnvelope,
          tokenRequestFields: auth.tokenRequestFields,
          tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
          tokenRequestFormat: auth.tokenRequestFormat,
          tokenUrl,
          extraFields: createTokenExtraFields(pending, auth.tokenRequestCallbackParameters, input.callbackParameters),
          signal: input.signal,
          createError,
        });
      }
      const refreshParameters = readCallbackParameters(auth.tokenRequestCallbackParameters, input.callbackParameters);
      const oauthCredential = {
        authType: "oauth2" as const,
        ...tokenResponse,
        profile: {
          accountId: "oauth2",
          displayName: "OAuth Credential",
          grantedScopes: request ? [] : (pending.authorizationScopes ?? []),
        },
        providerSecret:
          Object.keys(refreshParameters).length > 0 ? { oauthRefreshParameters: refreshParameters } : undefined,
        metadata: {
          ...tokenResponse.metadata,
          oauthClientId: config.clientId,
          oauthClientExtra: config.extra,
          oauthClientSecretExtra: config.secretExtra,
          oauthClientConfig: pending.clientConfig ? config : undefined,
        },
      };

      if (request) {
        const credential = await this.connections.prepareOAuthCredential(
          pending.service,
          oauthCredential,
          input.signal,
        );
        const granted = new Set(credential.profile.grantedScopes);
        const missing = auth.authorizationOptions?.filter((option) => option.required && !granted.has(option.id)) ?? [];
        if (missing.length)
          throw new OAuthFlowError("scope_missing", "The provider did not grant required OAuth scopes.");
        input.signal?.throwIfAborted();
        const appId = await this.requests.complete(request, credential, input.signal);
        if (!appId) {
          if (request.target) {
            try {
              await this.connections.getStoredConnection(request.target.id);
            } catch (error) {
              if (error instanceof ConnectionError && error.code === "connection_not_found")
                throw new OAuthFlowError("app_not_found", "App not found.");
              throw error;
            }
          }
          throw new OAuthFlowError("request_key_conflict", "The connection changed during authorization.");
        }
      } else {
        await this.connections.setOAuthCredential(
          pending.service,
          oauthCredential,
          pending.connectionName,
          input.signal,
        );
      }
      return {
        service: pending.service,
        connected: true,
        ...(request?.returnUri ? { returnUri: callbackReturnUri(request, "success") } : {}),
      };
    } catch (error) {
      if (request) {
        const code =
          error instanceof OAuthFlowError &&
          ["app_not_found", "request_key_conflict", "scope_missing"].includes(error.code)
            ? error.code
            : "provider_error";
        const message = "OAuth connection failed.";
        await this.requests.fail(request.connectionRequestId, code, message);
        throw new OAuthCallbackError(code, message, callbackReturnUri(request, "error", code, message), error);
      }
      throw error;
    }
  }

  private resolveCustomClientConfig(service: string, input: OAuthClientConfigInput): OAuthClientConfig {
    if (!this.isCustomClientConfigAllowed(service)) {
      throw new OAuthFlowError(
        "oauth_custom_app_not_allowed",
        `Custom OAuth apps are not enabled for ${service} on this runtime.`,
      );
    }
    if (!this.secretCodec?.encrypted) {
      throw new OAuthFlowError(
        "oauth_custom_app_encryption_required",
        "Configure OOMOL_CONNECT_ENCRYPTION_KEY before using a custom OAuth app.",
      );
    }
    return this.clientConfigs.normalizeConfig(service, input);
  }
}

function setAuthorizationParam(
  url: URL,
  fieldName: string | false | undefined,
  defaultFieldName: string,
  value: string,
): void {
  if (fieldName !== false) {
    url.searchParams.set(fieldName ?? defaultFieldName, value);
  }
}

function createTokenExtraFields(
  state: OAuthAuthorizationState,
  parameterNames: readonly string[] | undefined,
  callbackParameters: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const fields = readCallbackParameters(parameterNames, callbackParameters);
  if (state.pkceCodeVerifier) fields.code_verifier = state.pkceCodeVerifier;
  return Object.keys(fields).length > 0 ? fields : undefined;
}

function readCallbackParameters(
  parameterNames: readonly string[] | undefined,
  values: Record<string, string> | undefined,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const name of parameterNames ?? []) {
    const value = values?.[name];
    if (value) fields[name] = value;
  }
  return fields;
}

function isExpiredOAuthState(state: OAuthAuthorizationState, maxAgeMs: number): boolean {
  const createdAt = Date.parse(state.createdAt);
  return !Number.isFinite(createdAt) || Date.now() - createdAt > maxAgeMs;
}

function createPkceCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

function createPkceCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function resolveAuthorizationScopes(
  auth: OAuth2AuthDefinition,
  optionIds: string[] | undefined,
  fallback: string[],
): string[] {
  const options = auth.authorizationOptions;
  if (!options) return fallback;
  if (optionIds === undefined) return fallback;
  const byId = new Map(options.map((option) => [option.id, option]));
  const selected = new Set(optionIds);
  for (const option of options) if (option.required) selected.add(option.id);
  for (const id of selected) {
    const option = byId.get(id);
    if (!option) throw new OAuthFlowError("invalid_input", `Unknown OAuth authorization option: ${id}.`);
    for (const required of option.requires ?? []) selected.add(required);
  }
  return options.filter((option) => selected.has(option.id)).map((option) => option.id);
}

/**
 * Error with a stable code suitable for HTTP responses.
 */
export class OAuthFlowError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface OAuthConnectionRequestInput {
  service: string;
  owner: string;
  target?: StoredConnection;
  returnUri?: string;
  authorizationOptionIds?: string[];
  extra?: Record<string, unknown>;
  secretExtra?: Record<string, string>;
}

export interface OAuthConnectionRequestStart {
  authorizationUrl: string;
  stateHandle: string;
  connectionRequestId: string;
  status: "initiated";
  expiresAt: string;
}

function validateReturnUri(value?: string): void {
  if (!value) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthFlowError("invalid_input", "returnUri must be a valid URL.");
  }
  if (!["http:", "https:", "oomol:"].includes(url.protocol)) {
    throw new OAuthFlowError("invalid_input", "returnUri scheme is not allowed.");
  }
}

export class OAuthCallbackError extends OAuthFlowError {
  readonly returnUri?: string;
  constructor(code: string, message: string, returnUri: string | undefined, cause: unknown) {
    super(code, message);
    this.returnUri = returnUri;
    this.cause = cause;
  }
}

function callbackReturnUri(
  pending: PendingConnectionRequest,
  status: "success" | "error",
  code?: string,
  message?: string,
): string | undefined {
  if (!pending.returnUri) return undefined;
  const url = new URL(pending.returnUri);
  url.searchParams.set("status", status);
  url.searchParams.set("service", pending.service);
  if (code) url.searchParams.set("code", code);
  if (message) url.searchParams.set("message", message);
  return url.toString();
}
