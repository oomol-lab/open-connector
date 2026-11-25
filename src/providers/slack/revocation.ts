import type { OAuthTokenRevokeInput } from "../../oauth/oauth-token.ts";

import { requestTokenRevocation, readOAuthRevocationPayload } from "../../oauth/oauth-token.ts";

export async function revokeAccessToken(input: OAuthTokenRevokeInput): Promise<void> {
  const { accessToken, refreshToken } = input;

  if (!accessToken?.trim()) return;
  await requestTokenRevocation({
    revocationUrl: "https://slack.com/api/auth.revoke",
    request: {
      body: new URLSearchParams({ token: accessToken }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    },
    fetcher: input.fetcher,
    createError: input.createError,
    async isRevoked(response) {
      if (!response.ok && response.status !== 401) return false;
      const payload = await readOAuthRevocationPayload(response);
      return (
        (response.ok && payload?.ok === true && payload.revoked === true) ||
        (payload?.ok === false &&
          (payload.error === "token_revoked" || (payload.error === "token_expired" && !refreshToken?.trim())))
      );
    },
  });
}
