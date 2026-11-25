import type { OAuthTokenRevokeInput } from "../../oauth/oauth-token.ts";

import { optionalRecord } from "../../core/cast.ts";
import { requestTokenRevocation, readOAuthRevocationPayload } from "../../oauth/oauth-token.ts";
import { resolveIntercomApiBaseUrl } from "./runtime.ts";

export async function revokeAccessToken(input: OAuthTokenRevokeInput): Promise<void> {
  const { accessToken, providerMetadata } = input;

  if (!accessToken.trim()) return;
  const baseUrl = resolveIntercomApiBaseUrl(providerMetadata);
  await requestTokenRevocation({
    revocationUrl: `${baseUrl}/auth/uninstall`,
    request: {
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
    },
    fetcher: input.fetcher,
    createError: input.createError,
    async isRevoked(response) {
      if (response.ok) return true;
      if (response.status !== 401) return false;
      const payload = await readOAuthRevocationPayload(response);
      if (payload?.type !== "error.list" || !Array.isArray(payload.errors) || payload.errors.length !== 1) {
        return false;
      }
      const error = optionalRecord(payload.errors[0]);
      return error?.code === "unauthorized" && error.message === "Access Token Invalid";
    },
  });
}
