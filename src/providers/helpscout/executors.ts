import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { fetchHelpscoutCurrentUser, helpscoutActionHandlers } from "./runtime.ts";

const service = "helpscout";
const helpscoutApiBaseUrl = "https://api.helpscout.net/v2";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, helpscoutActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: helpscoutApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/hal+json, application/json");
  },
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
      metadata: { apiBaseUrl: helpscoutApiBaseUrl },
    };
  },
};
