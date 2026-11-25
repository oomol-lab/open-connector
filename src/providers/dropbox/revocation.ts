import type { OAuthTokenRevokeInput } from "../../oauth/oauth-token.ts";

import { optionalRecord } from "../../core/cast.ts";
import { requestTokenRevocation, readOAuthRevocationPayload } from "../../oauth/oauth-token.ts";

export async function revokeAccessToken(input: OAuthTokenRevokeInput): Promise<void> {
  const { accessToken, refreshToken } = input;

  if (!accessToken?.trim()) return;
  await requestTokenRevocation({
    revocationUrl: "https://api.dropboxapi.com/2/auth/token/revoke",
    request: { headers: { authorization: `Bearer ${accessToken}` } },
    fetcher: input.fetcher,
    createError: input.createError,
    async isRevoked(response) {
      if (response.ok) return true;
      if (response.status !== 401) return false;
      const payload = await readOAuthRevocationPayload(response);
      const tag = optionalRecord(payload?.error)?.[".tag"];
      return tag === "invalid_access_token" || (tag === "expired_access_token" && !refreshToken?.trim());
    },
  });
}
