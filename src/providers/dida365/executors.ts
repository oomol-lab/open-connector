import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { dida365ActionHandlers, dida365ApiBaseUrl, fetchDida365CurrentAccount } from "./runtime.ts";

const service = "dida365";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, dida365ActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dida365ApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    return fetchDida365CurrentAccount(input.accessToken, fetcher, signal);
  },
};
