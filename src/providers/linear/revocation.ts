import type { OAuthTokenRevokeInput } from "../../oauth/oauth-token.ts";

import {
  requestTokenRevocation,
  selectOAuthRevocationToken,
  readOAuthRevocationPayload,
} from "../../oauth/oauth-token.ts";

export async function revokeAccessToken(input: OAuthTokenRevokeInput): Promise<void> {
  const { accessToken, refreshToken } = input;

  const token = selectOAuthRevocationToken({ accessToken, refreshToken });
  if (!token) return;

  await requestTokenRevocation({
    revocationUrl: "https://api.linear.app/oauth/revoke",
    request: { body: new URLSearchParams(token), headers: { "content-type": "application/x-www-form-urlencoded" } },
    fetcher: input.fetcher,
    createError: input.createError,
    async isRevoked(response) {
      if (response.ok) return true;
      if (response.status !== 400 && response.status !== 401) return false;
      const payload = await readOAuthRevocationPayload(response);
      return (
        payload?.error === "Token not found" ||
        payload?.error === "Token already revoked" ||
        payload?.error === "invalid_token"
      );
    },
  });
}
