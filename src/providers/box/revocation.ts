import type { OAuthTokenRevokeInput } from "../../oauth/oauth-token.ts";

import {
  requestTokenRevocation,
  selectOAuthRevocationToken,
  readOAuthRevocationPayload,
} from "../../oauth/oauth-token.ts";

export async function revokeAccessToken(input: OAuthTokenRevokeInput): Promise<void> {
  const token = selectOAuthRevocationToken(input);
  if (!token) return;
  const { clientConfig } = input;
  await requestTokenRevocation({
    revocationUrl: "https://api.box.com/oauth2/revoke",
    request: {
      body: new URLSearchParams({
        token: token.token,
        client_id: clientConfig.clientId,
        client_secret: clientConfig.clientSecret,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    },
    fetcher: input.fetcher,
    createError: input.createError,
    async isRevoked(response) {
      if (response.ok) return true;
      if (response.status !== 400) return false;
      return (await readOAuthRevocationPayload(response))?.error === "invalid_token";
    },
  });
}
