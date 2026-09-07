import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { webexActionHandlers, webexApiBaseUrl } from "./runtime.ts";

const service = "webex";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, webexActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: webexApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
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
