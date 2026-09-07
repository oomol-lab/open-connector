import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateVimeoCredential, vimeoActionHandlers, vimeoApiBaseUrl } from "./runtime.ts";

const service = "vimeo";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, vimeoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: vimeoApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/vnd.vimeo.*+json;version=3.4");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return validateVimeoCredential(input.accessToken, fetcher, signal);
  },
};
