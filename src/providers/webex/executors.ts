import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import { webexActionHandlers, webexApiBaseUrl } from "./runtime.ts";

export const executors: ProviderExecutors = defineOAuthProviderExecutors("webex", webexActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const response = await fetcher(`${webexApiBaseUrl}/people/me`, {
      headers: { authorization: `Bearer ${input.accessToken}` },
    });
    if (!response.ok) throw new ProviderRequestError(400, "Webex credential is invalid or expired");
    const person = (await response.json()) as Record<string, unknown>;
    return {
      profile: {
        accountId: typeof person.id === "string" ? person.id : undefined,
        displayName: typeof person.displayName === "string" ? person.displayName : "Webex User",
      },
      grantedScopes: input.profile.grantedScopes,
    };
  },
};
