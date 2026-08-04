import type { ResolvedCredential } from "../../core/types.ts";

import { ConnectionError } from "../../connection-service.ts";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { expiresAtFromLifetime } from "../../oauth/oauth-token.ts";
import { slackUserOAuthScopes } from "./scopes.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

export interface SlackUserGrant {
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  scopes: string[];
}

export type SlackRefreshTokenRequest = (refreshToken: string) => Promise<OAuthCredential>;

/** Move Slack's nested user grant into provider-owned secret state before storage. */
export function normalizeSlackAuthorizationCredential(credential: OAuthCredential): OAuthCredential {
  assertSlackTokenKind(credential.metadata.rawTokenType, "bot", "oauth_token_exchange_failed");

  const userGrant = normalizeSlackUserGrant(optionalRecord(credential.metadata.authed_user));
  const metadata = { ...credential.metadata };
  delete metadata.authed_user;
  const grantedScopes = uniqueSlackScopes([...readSlackScopes(metadata.scope), ...(userGrant?.scopes ?? [])]);

  return {
    ...credential,
    tokenType: "Bearer",
    expiresAt: earliestSlackExpiresAt(credential.expiresAt, userGrant?.expiresAt),
    providerSecret: userGrant ? { userGrant } : undefined,
    profile: {
      ...credential.profile,
      grantedScopes,
    },
    metadata,
  };
}

/** Refresh Slack's user grant and primary bot grant as one stored credential update. */
export async function refreshSlackOAuthCredential(
  credential: OAuthCredential,
  requestRefreshToken: SlackRefreshTokenRequest,
): Promise<OAuthCredential> {
  const previousUserGrant = readSlackUserGrant(credential.providerSecret);
  if (credential.providerSecret?.userGrant !== undefined && !previousUserGrant) {
    throw slackUserGrantReconnectError();
  }
  if (previousUserGrant && !previousUserGrant.refreshToken) {
    throw slackUserGrantReconnectError();
  }

  const userGrant = previousUserGrant ? await refreshSlackUserGrant(previousUserGrant, requestRefreshToken) : undefined;
  const refreshedBot = await requestRefreshToken(credential.refreshToken ?? "");
  assertSlackTokenKind(refreshedBot.metadata.rawTokenType, "bot", "oauth_token_refresh_failed");
  const botExpiresAt = requireSlackRefreshExpiresAt(refreshedBot);
  const refreshedBotScopes = readSlackScopes(refreshedBot.metadata.scope);
  const previousBotScopes = credential.profile.grantedScopes.filter((scope) => !slackUserOAuthScopes.includes(scope));
  const grantedScopes = uniqueSlackScopes([
    ...(refreshedBotScopes.length > 0 ? refreshedBotScopes : previousBotScopes),
    ...(userGrant?.scopes ?? []),
  ]);

  return {
    ...refreshedBot,
    tokenType: "Bearer",
    refreshToken: refreshedBot.refreshToken ?? credential.refreshToken,
    expiresAt: earliestSlackExpiresAt(botExpiresAt, userGrant?.expiresAt),
    providerSecret: userGrant ? { userGrant } : credential.providerSecret,
    profile: {
      ...credential.profile,
      grantedScopes,
    },
    metadata: {
      ...credential.metadata,
      ...refreshedBot.metadata,
      refreshedAt: new Date().toISOString(),
    },
  };
}

export function readSlackUserGrant(providerSecret: Record<string, unknown> | undefined): SlackUserGrant | undefined {
  const value = optionalRecord(providerSecret?.userGrant);
  const accessToken = optionalString(value?.accessToken);
  const refreshToken = value?.refreshToken;
  const expiresAt = value?.expiresAt;
  const scopes = value?.scopes;
  if (
    !accessToken ||
    typeof refreshToken !== "string" ||
    (expiresAt !== undefined && typeof expiresAt !== "string") ||
    !Array.isArray(scopes) ||
    !scopes.every((scope) => typeof scope === "string")
  ) {
    return undefined;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    scopes,
  };
}

async function refreshSlackUserGrant(
  previous: SlackUserGrant,
  requestRefreshToken: SlackRefreshTokenRequest,
): Promise<SlackUserGrant> {
  const refreshed = await requestRefreshToken(previous.refreshToken);
  assertSlackTokenKind(refreshed.metadata.rawTokenType, "user", "oauth_token_refresh_failed");
  const scopes = readSlackScopes(refreshed.metadata.scope);
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? previous.refreshToken,
    expiresAt: requireSlackRefreshExpiresAt(refreshed),
    scopes: scopes.length > 0 ? scopes : previous.scopes,
  };
}

function normalizeSlackUserGrant(payload: Record<string, unknown> | undefined): SlackUserGrant | undefined {
  const accessToken = optionalString(payload?.access_token);
  if (!accessToken) {
    return undefined;
  }

  assertSlackTokenKind(payload?.token_type, "user", "oauth_token_exchange_failed");
  return {
    accessToken,
    refreshToken: optionalString(payload?.refresh_token) ?? "",
    expiresAt: expiresAtFromLifetime(payload?.expires_in),
    scopes: readSlackScopes(payload?.scope),
  };
}

function requireSlackRefreshExpiresAt(credential: OAuthCredential): string {
  if (typeof credential.metadata.expires_in !== "number" || !credential.expiresAt) {
    throw new ConnectionError(
      "oauth_token_refresh_failed",
      "Slack OAuth refresh response is missing a valid expires_in value.",
    );
  }
  return credential.expiresAt;
}

function earliestSlackExpiresAt(first: string | undefined, second: string | undefined): string | undefined {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

export function readSlackScopes(value: unknown): string[] {
  return (optionalString(value) ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function uniqueSlackScopes(scopes: string[]): string[] {
  return [...new Set(scopes)];
}

function assertSlackTokenKind(
  value: unknown,
  expected: "bot" | "user",
  errorCode: "oauth_token_exchange_failed" | "oauth_token_refresh_failed",
): void {
  if (value !== expected) {
    throw new ConnectionError(errorCode, `Slack OAuth response is invalid: expected a ${expected} token.`);
  }
}

function slackUserGrantReconnectError(): ConnectionError {
  return new ConnectionError(
    "oauth_token_expired",
    "Reconnect Slack to restore the user authorization required for message search.",
  );
}
