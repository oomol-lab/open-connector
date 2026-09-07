import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { longbridgeActionHandlers, longbridgeApiBaseUrl, validateLongbridgeCredential } from "./runtime.ts";

const service = "longbridge";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, longbridgeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: longbridgeApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    return validateLongbridgeCredential(input.accessToken, fetcher, signal);
  },
};
