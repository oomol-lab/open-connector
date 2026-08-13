import type { ConnectionService } from "../connection-service.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";
import type {
  OAuthClientConfig,
  OAuthClientConfigInput,
  OAuthClientConfigService,
} from "./oauth-client-config-service.ts";

import { createHash, randomBytes } from "node:crypto";
import { normalizeSlackAuthorizationCredential } from "../providers/slack/oauth.ts";
import { requestAuthorizationCodeToken } from "./oauth-token.ts";
import { requestOAuth1AccessCredential, requestOAuth1TemporaryCredential } from "./oauth1-token.ts";

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
}

export interface OAuthAuthorizationCompleteInput {
  state: string;
  code?: string;
  oauthToken?: string;
  oauthVerifier?: string;
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
  oauth1RequestToken?: string;
  oauth1RequestTokenSecret?: string;
  oauth1Config?: OAuthClientConfig;
  clientConfig?: OAuthClientConfig;
}

export interface OAuthFlowServiceOptions {
  clientConfigs: OAuthClientConfigService;
  connections: ConnectionService;
  states: IOAuthStateStore;
  stateMaxAgeMs?: number;
  secretCodec?: ISecretCodec;
  isCustomClientConfigAllowed?: (service: string) => boolean;
}

/**
 * Storage contract for pending OAuth authorization states.
 */
export interface IOAuthStateStore {
  set(state: OAuthAuthorizationState): Promise<void>;
  take(state: string): Promise<OAuthAuthorizationState | undefined>;
}

/**
 * Coordinates runtime OAuth authorization and token exchange.
 */
export class OAuthFlowService {
  private readonly clientConfigs: OAuthClientConfigService;
  private readonly connections: ConnectionService;
  private readonly states: IOAuthStateStore;
  private readonly stateMaxAgeMs: number;
  private readonly secretCodec?: ISecretCodec;
  private readonly isCustomClientConfigAllowed: (service: string) => boolean;

  constructor(input: OAuthFlowServiceOptions) {
    this.clientConfigs = input.clientConfigs;
    this.connections = input.connections;
    this.states = input.states;
    this.stateMaxAgeMs = input.stateMaxAgeMs ?? 15 * 60 * 1000;
    this.secretCodec = input.secretCodec;
    this.isCustomClientConfigAllowed = input.isCustomClientConfigAllowed ?? (() => false);
  }

  async startAuthorization(input: OAuthAuthorizationStartInput): Promise<OAuthAuthorizationStart> {
    const { service, connectionName } = input;
    this.connections.assertProviderAvailable(service);
    const auth = this.clientConfigs.getOAuthDefinition(service);
    const config = input.clientConfig
      ? this.resolveCustomClientConfig(service, input.clientConfig)
      : await this.clientConfigs.getConfig(service);
    if (!config) {
      throw new OAuthFlowError("oauth_client_config_required", `Configure an OAuth client for ${service} first.`);
    }

    const state = crypto.randomUUID();
    if (auth.type === "oauth1") {
      const callbackUrl = new URL(this.clientConfigs.expectedRedirectUri(service));
      callbackUrl.searchParams.set("state", state);
      const temporaryCredential = await requestOAuth1TemporaryCredential({
        requestTokenUrl: this.clientConfigs.resolveEndpointUrl(service, auth.requestTokenUrl, config),
        callbackUrl: callbackUrl.toString(),
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        createError: (message) => new OAuthFlowError("oauth_token_exchange_failed", message),
      });
      await this.states.set({
        service,
        connectionName,
        state,
        createdAt: new Date().toISOString(),
        oauth1RequestToken: temporaryCredential.token,
        oauth1RequestTokenSecret: temporaryCredential.tokenSecret,
        oauth1Config: config,
        clientConfig: input.clientConfig ? config : undefined,
      });

      const authorizationUrl = new URL(this.clientConfigs.resolveEndpointUrl(service, auth.authorizationUrl, config));
      for (const [key, value] of Object.entries(auth.authorizationParams ?? {})) {
        authorizationUrl.searchParams.set(key, value);
      }
      authorizationUrl.searchParams.set("oauth_token", temporaryCredential.token);
      const effectiveScopes = this.clientConfigs.getEffectiveScopes(service, config);
      if (effectiveScopes.length > 0) {
        authorizationUrl.searchParams.set("scope", effectiveScopes.join(auth.scopeSeparator ?? " "));
      }
      return { authorizationUrl: authorizationUrl.toString(), state };
    }

    const pkceCodeVerifier = auth.pkce ? createPkceCodeVerifier() : undefined;
    await this.states.set({
      service,
      connectionName,
      state,
      createdAt: new Date().toISOString(),
      pkceCodeVerifier,
      clientConfig: input.clientConfig ? config : undefined,
    });

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
    const effectiveScopes = this.clientConfigs.getEffectiveScopes(service, config);
    if (effectiveScopes.length > 0 && auth.authorizationRequestFields?.scope !== false) {
      authorizationUrl.searchParams.set(
        auth.authorizationRequestFields?.scope ?? "scope",
        effectiveScopes.join(auth.scopeSeparator ?? " "),
      );
    }
    if (pkceCodeVerifier) {
      authorizationUrl.searchParams.set("code_challenge", createPkceCodeChallenge(pkceCodeVerifier));
      authorizationUrl.searchParams.set("code_challenge_method", auth.pkce?.method ?? "S256");
    }

    return {
      authorizationUrl: authorizationUrl.toString(),
      state,
    };
  }

  async completeAuthorization(input: OAuthAuthorizationCompleteInput): Promise<{ service: string; connected: true }> {
    const pending = await this.states.take(input.state);
    if (!pending) {
      throw new OAuthFlowError("invalid_oauth_state", "OAuth state is missing or expired.");
    }
    if (isExpiredOAuthState(pending, this.stateMaxAgeMs)) {
      throw new OAuthFlowError("invalid_oauth_state", "OAuth state is missing or expired.");
    }

    const auth = this.clientConfigs.getOAuthDefinition(pending.service);
    const config =
      pending.oauth1Config ?? pending.clientConfig ?? (await this.clientConfigs.getConfig(pending.service));
    if (!config) {
      throw new OAuthFlowError(
        "oauth_client_config_required",
        `Configure an OAuth client for ${pending.service} first.`,
      );
    }

    if (auth.type === "oauth1") {
      const requestToken = pending.oauth1RequestToken;
      const requestTokenSecret = pending.oauth1RequestTokenSecret;
      if (!requestToken || !requestTokenSecret || !input.oauthToken || !input.oauthVerifier) {
        throw new OAuthFlowError("invalid_oauth_callback", "OAuth 1.0 callback is missing its token or verifier.");
      }
      if (input.oauthToken !== requestToken) {
        throw new OAuthFlowError("invalid_oauth_callback", "OAuth 1.0 callback token does not match the pending flow.");
      }

      const credential = await requestOAuth1AccessCredential({
        accessTokenUrl: this.clientConfigs.resolveEndpointUrl(pending.service, auth.accessTokenUrl, config),
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        requestToken,
        requestTokenSecret,
        verifier: input.oauthVerifier,
        createError: (message) => new OAuthFlowError("oauth_token_exchange_failed", message),
      });
      const effectiveScopes = this.clientConfigs.getEffectiveScopes(pending.service, config);
      await this.connections.setOAuthCredential(
        pending.service,
        {
          ...credential,
          profile: { ...credential.profile, grantedScopes: effectiveScopes },
          metadata: {
            oauthClientId: config.clientId,
            scope: effectiveScopes.join(auth.scopeSeparator ?? " "),
            oauthClientExtra: config.extra,
            oauthClientSecretExtra: config.secretExtra,
            oauthClientConfig: pending.clientConfig ? config : undefined,
          },
        },
        pending.connectionName,
      );
      return { service: pending.service, connected: true };
    }

    if (!input.code) {
      throw new OAuthFlowError("invalid_oauth_callback", "OAuth 2.0 callback is missing its authorization code.");
    }

    let tokenResponse = await requestAuthorizationCodeToken({
      code: input.code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: this.clientConfigs.expectedRedirectUri(pending.service),
      responseEnvelope: auth.tokenResponseEnvelope,
      tokenRequestFields: auth.tokenRequestFields,
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      tokenRequestFormat: auth.tokenRequestFormat,
      tokenUrl: this.clientConfigs.resolveEndpointUrl(pending.service, auth.tokenUrl, config),
      extraFields: createTokenExtraFields(pending),
      createError: (message) => new OAuthFlowError("oauth_token_exchange_failed", message),
    });
    if (pending.service == "slack") {
      // Slack returns a separately rotated user grant in `authed_user`.
      // Move it out of non-secret metadata before storing the credential.
      tokenResponse = normalizeSlackAuthorizationCredential(tokenResponse);
    }
    const oauthCredential = {
      ...tokenResponse,
      metadata: {
        ...tokenResponse.metadata,
        oauthClientId: config.clientId,
        oauthClientExtra: config.extra,
        oauthClientSecretExtra: config.secretExtra,
        oauthClientConfig: pending.clientConfig ? config : undefined,
      },
    };

    await this.connections.setOAuthCredential(pending.service, oauthCredential, pending.connectionName);
    return {
      service: pending.service,
      connected: true,
    };
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

function createTokenExtraFields(state: OAuthAuthorizationState): Record<string, string> | undefined {
  if (!state.pkceCodeVerifier) {
    return undefined;
  }

  return {
    code_verifier: state.pkceCodeVerifier,
  };
}

function isExpiredOAuthState(state: OAuthAuthorizationState, maxAgeMs: number): boolean {
  const createdAt = Date.parse(state.createdAt);
  return !Number.isFinite(createdAt) || Date.now() - createdAt > maxAgeMs;
}

function createPkceCodeVerifier(): string {
  return encodeBase64Url(randomBytes(48));
}

function createPkceCodeChallenge(codeVerifier: string): string {
  return encodeBase64Url(createHash("sha256").update(codeVerifier).digest());
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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
