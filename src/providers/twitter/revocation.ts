import type { OAuthTokenRevokeInput } from "../../oauth/oauth-token.ts";

import {
  requestTokenRevocation,
  selectOAuthRevocationToken,
  readOAuthRevocationPayload,
} from "../../oauth/oauth-token.ts";
import { basicAuthorizationHeader } from "../provider-runtime.ts";

export async function revokeAccessToken(input: OAuthTokenRevokeInput): Promise<void> {
  const { accessToken, refreshToken, clientConfig } = input;

  const revocation = selectOAuthRevocationToken({ accessToken, refreshToken });
  if (!revocation) return;
  const { clientId, clientSecret } = clientConfig;
  const hasClientSecret = Boolean(clientSecret.trim());
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (hasClientSecret) headers.authorization = basicAuthorizationHeader(`${clientId}:${clientSecret}`);
  await requestTokenRevocation({
    revocationUrl: "https://api.x.com/2/oauth2/revoke",
    request: {
      body: new URLSearchParams(
        hasClientSecret ? { token: revocation.token } : { token: revocation.token, client_id: clientId },
      ),
      headers,
    },
    fetcher: input.fetcher,
    createError: input.createError,
    async isRevoked(response) {
      return (
        response.ok ||
        (response.status === 400 && (await readOAuthRevocationPayload(response))?.error === "invalid_token")
      );
    },
  });
}
