import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineOAuthProviderExecutors } from "../provider-runtime.ts";
import { bitbucketActionHandlers, bitbucketApiBaseUrl } from "./runtime.ts";

export const executors: ProviderExecutors = defineOAuthProviderExecutors("bitbucket", bitbucketActionHandlers, {
  skipDnsValidation: true,
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
