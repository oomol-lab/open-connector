import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { basicAuthorizationHeader, runProviderRequest } from "../provider-runtime.ts";
import { githubApiBaseUrl, githubApiVersion, githubDefaultAcceptHeader } from "./runtime-shared.ts";

/** GitHub revokes a single app token through its app-owner API, not RFC 7009. */
export const githubOAuthRuntime: ProviderOAuthRuntime = {
  async revokeAccessToken(input): Promise<void> {
    try {
      await runProviderRequest({ label: "github token revocation", timeoutMs: 5_000 }, async (signal) => {
        const response = await input.fetcher(
          `${githubApiBaseUrl}/applications/${encodeURIComponent(input.clientConfig.clientId)}/token`,
          {
            method: "DELETE",
            headers: {
              accept: githubDefaultAcceptHeader,
              authorization: basicAuthorizationHeader(
                `${input.clientConfig.clientId}:${input.clientConfig.clientSecret}`,
              ),
              "content-type": "application/json",
              "x-github-api-version": githubApiVersion,
            },
            body: JSON.stringify({ access_token: input.accessToken }),
            redirect: "manual",
            signal,
          },
        );
        await response.body?.cancel();
        if (response.status !== 204)
          throw input.createError(`GitHub token revocation failed (HTTP ${response.status}).`);
      });
    } catch {
      // Neither provider bodies nor transport errors can echo credentials to callers.
      throw input.createError("GitHub token revocation failed.");
    }
  },
};
