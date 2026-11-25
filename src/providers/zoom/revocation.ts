import type { OAuthTokenRevokeInput } from "../../oauth/oauth-token.ts";

import { optionalString } from "../../core/cast.ts";
import { requestTokenRevocation, readOAuthRevocationPayload } from "../../oauth/oauth-token.ts";
import { basicAuthorizationHeader } from "../provider-runtime.ts";

export async function revokeAccessToken(input: OAuthTokenRevokeInput): Promise<void> {
  const { accessToken, refreshToken, clientConfig } = input;
  await requestTokenRevocation({
    revocationUrl: "https://zoom.us/oauth/revoke",
    request: {
      body: new URLSearchParams({ token: accessToken }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "authorization": basicAuthorizationHeader(`${clientConfig.clientId}:${clientConfig.clientSecret}`),
      },
    },
    fetcher: input.fetcher,
    createError: input.createError,
    async isRevoked(response) {
      if (!response.ok && response.status !== 400 && response.status !== 401) return false;
      const payload = await readOAuthRevocationPayload(response);
      if (response.ok) return payload?.status === "success";
      if (payload?.code === 4741 || payload?.code === "4741") return true;
      if (refreshToken?.trim()) return false;
      const reason = optionalString(payload?.reason)?.trim().toLowerCase();
      return (
        payload?.error === "invalid_token" ||
        (payload?.error === "invalid_request" && (reason === "invalid token" || reason === "invalid token!"))
      );
    },
  });
}
