import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bitbucketActionHandlers, bitbucketApiBaseUrl } from "./runtime.ts";

export const executors: ProviderExecutors = defineOAuthProviderExecutors("bitbucket", bitbucketActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "bitbucket",
  baseUrl: bitbucketApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const response = await fetcher(`${bitbucketApiBaseUrl}/user`, {
      headers: { authorization: `Bearer ${input.accessToken}` },
    });
    if (!response.ok) throw new Error(`Bitbucket credential validation failed with status ${response.status}`);
    const user = (await response.json()) as Record<string, unknown>;
    return {
      profile: {
        accountId: typeof user.uuid === "string" ? user.uuid : undefined,
        displayName: typeof user.display_name === "string" ? user.display_name : "Bitbucket User",
      },
      grantedScopes: input.profile.grantedScopes,
    };
  },
};
