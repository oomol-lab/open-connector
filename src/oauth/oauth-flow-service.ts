import type { ConnectionService } from "../connection-service.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";

import { createHash, randomBytes } from "node:crypto";
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
}

export interface OAuthAuthorizationCompleteInput {
  state: string;
  code: string;
}

/**
 * Short-lived OAuth state stored while the browser completes authorization.
 */
export type OAuthAuthorizationState = {
  service: string;
  connectionName?: string;
  state: string;
  createdAt: string;
  pkceCodeVerifier?: string;
};

/**
 * Storage contract for pending OAuth authorization states.
 */
export interface IOAuthStateStore {
  set(state: OAuthAuthorizationState): Promise<void>;
  take(state: string): Promise<OAuthAuthorizationState | undefined>;
}

/**
 * Coordinates localhost OAuth authorization and token exchange.
 */
export class OAuthFlowService {
  private readonly clientConfigs: OAuthClientConfigService;
  private readonly connections: ConnectionService;
  private readonly states: IOAuthStateStore;
  private readonly stateMaxAgeMs: number;

  constructor(input: {
    clientConfigs: OAuthClientConfigService;
    connections: ConnectionService;
    states: IOAuthStateStore;
    stateMaxAgeMs?: number;
  }) {
    this.clientConfigs = input.clientConfigs;
    this.connections = input.connections;
    this.states = input.states;
    this.stateMaxAgeMs = input.stateMaxAgeMs ?? 15 * 60 * 1000;
  }

  async startAuthorization(input: OAuthAuthorizationStartInput): Promise<OAuthAuthorizationStart> {
    const { service, connectionName } = input;
    const auth = this.clientConfigs.getOAuthDefinition(service);
    const config = await this.clientConfigs.getConfig(service);
    if (!config) {
      throw new OAuthFlowError("oauth_client_config_required", `Configure an OAuth client for ${service} first.`);
    }

    const state = crypto.randomUUID();
    const pkceCodeVerifier = auth.pkce ? createPkceCodeVerifier() : undefined;
    await this.states.set({
      service,
      connectionName,
      state,
      createdAt: new Date().toISOString(),
      pkceCodeVerifier,
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
    if (auth.scopes.length > 0 && auth.authorizationRequestFields?.scope !== false) {
      authorizationUrl.searchParams.set(
        auth.authorizationRequestFields?.scope ?? "scope",
        auth.scopes.join(auth.scopeSeparator ?? " "),
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
    const config = await this.clientConfigs.getConfig(pending.service);
    if (!config) {
      throw new OAuthFlowError(
        "oauth_client_config_required",
        `Configure an OAuth client for ${pending.service} first.`,
      );
    }

    const tokenResponse = await requestAuthorizationCodeToken({
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
    const oauthCredential = {
      ...tokenResponse,
      metadata: {
        ...tokenResponse.metadata,
        oauthClientId: config.clientId,
        oauthClientExtra: config.extra,
        oauthClientSecretExtra: config.secretExtra,
      },
    };

    await this.connections.setOAuthCredential(pending.service, oauthCredential, pending.connectionName);
    return {
      service: pending.service,
      connected: true,
    };
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
