import type { OAuthTokenRevokeInput } from "../../../oauth/oauth-token.ts";

import {
  requestTokenRevocation,
  readOAuthRevocationPayload,
  selectOAuthRevocationToken,
} from "../../../oauth/oauth-token.ts";

export async function revokeAccessToken(input: OAuthTokenRevokeInput): Promise<void> {
  const token = selectOAuthRevocationToken(input);
  if (!token) return;

  await requestTokenRevocation({
    revocationUrl: "https://oauth2.googleapis.com/revoke",
    request: {
      body: new URLSearchParams({ token: token.token }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
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
