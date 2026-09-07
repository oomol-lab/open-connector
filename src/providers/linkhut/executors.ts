import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { linkhutActionHandlers, linkhutApiBaseUrl, validateLinkhutCredential } from "./runtime.ts";

const service = "linkhut";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, linkhutActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: linkhutApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return validateLinkhutCredential(input, fetcher, signal);
  },
};
