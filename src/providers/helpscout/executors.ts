import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors } from "../provider-runtime.ts";
import { fetchHelpscoutCurrentUser, helpscoutActionHandlers } from "./runtime.ts";

export const executors: ProviderExecutors = defineOAuthProviderExecutors("helpscout", helpscoutActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const user = await fetchHelpscoutCurrentUser(input.accessToken, fetcher);
    const id = optionalString(user.id) ?? (typeof user.id == "number" ? String(user.id) : undefined);
    const name = [optionalString(user.firstName), optionalString(user.lastName)].filter(Boolean).join(" ");
    const email = optionalString(user.email);
    return {
      profile: { accountId: id, displayName: name || email || (id ? `Help Scout User ${id}` : "Help Scout User") },
      grantedScopes: input.profile.grantedScopes,
      metadata: { apiBaseUrl: "https://api.helpscout.net/v2" },
    };
  },
};
