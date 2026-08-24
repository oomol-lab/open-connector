import type { ResolvedCredential } from "../../core/types.ts";

import { ConnectionError } from "../../connection-service.ts";
import { optionalRecord, optionalString } from "../../core/cast.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;
type SlackOAuthErrorCode = "oauth_token_exchange_failed" | "oauth_token_refresh_failed";

export type SlackOAuthTokenKind = "bot" | "user";

/** Return the token kind required by each Slack provider authorization path. */
export function getSlackOAuthTokenKind(service: string): SlackOAuthTokenKind | undefined {
  switch (service) {
    case "slack":
      return "user";
    case "slackbot":
      return "bot";
    default:
      return undefined;
  }
}

/** Validate and normalize a Slack OAuth response before storing the credential. */
export function normalizeSlackOAuthCredential(
  credential: OAuthCredential,
  expectedKind: SlackOAuthTokenKind,
  errorCode: SlackOAuthErrorCode,
): OAuthCredential {
  assertSlackTokenKind(credential.metadata.rawTokenType, expectedKind, errorCode);

  const metadata = { ...credential.metadata };
  const authedUser = optionalRecord(metadata.authed_user);
  const responseScopes = uniqueSlackScopes([...readSlackScopes(metadata.scope), ...readSlackScopes(authedUser?.scope)]);
  const grantedScopes = responseScopes.length > 0 ? responseScopes : credential.profile.grantedScopes;

  delete metadata.authed_user;
  if (responseScopes.length > 0) {
    metadata.scope = responseScopes.join(",");
  }

  return {
    ...credential,
    tokenType: "Bearer",
    providerSecret: undefined,
    profile: {
      ...credential.profile,
      grantedScopes,
    },
    metadata,
  };
}

function readSlackScopes(value: unknown): string[] {
  return (optionalString(value) ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function uniqueSlackScopes(scopes: string[]): string[] {
  return [...new Set(scopes)];
}

function assertSlackTokenKind(value: unknown, expected: SlackOAuthTokenKind, errorCode: SlackOAuthErrorCode): void {
  if (value != expected) {
    throw new ConnectionError(errorCode, `Slack OAuth response is invalid: expected a ${expected} token.`);
  }
}
