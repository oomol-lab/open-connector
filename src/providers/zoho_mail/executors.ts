import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { readOAuthScopes } from "../../oauth/oauth-scopes.ts";
import { requireOAuthCredential } from "../provider-credentials.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { resolveZohoDataCenter, zohoMailOrigin } from "./data-centers.ts";
import { fetchCurrentAccount } from "./runtime.ts";
export { executors } from "./runtime.ts";
export { oauth } from "./oauth.ts";

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const dataCenter = resolveZohoDataCenter(input.providerSecret?.dataCenter ?? input.metadata.dataCenter);
    return {
      profile: {
        ...(await fetchCurrentAccount(input.accessToken, dataCenter, fetcher, signal)),
        grantedScopes: readOAuthScopes(input.metadata.scope) ?? [],
      },
      metadata: { dataCenter },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "zoho_mail",
  async baseUrl(context, service) {
    const credential = await requireOAuthCredential(context, service);
    return zohoMailOrigin(credential.providerSecret?.dataCenter ?? credential.metadata.dataCenter);
  },
  auth: {
    type: "bearer_resolver",
    async resolve({ context, service }) {
      const credential = await requireOAuthCredential(context, service);
      return { accessToken: credential.accessToken, tokenType: "Zoho-oauthtoken" };
    },
  },
  defaultHeaders: { accept: "application/json" },
});
