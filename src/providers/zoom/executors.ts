import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { fetchZoomCurrentAccount, zoomActionHandlers, zoomApiBaseUrl } from "./runtime.ts";

const service = "zoom";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, zoomActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zoomApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return fetchZoomCurrentAccount(input.accessToken, input.metadata, fetcher, signal);
  },
};
