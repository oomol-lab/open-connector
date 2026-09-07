import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { calActionHandlers, calApiBaseUrl, resolveCalProxyApiVersion, validateCalCredential } from "./runtime.ts";

const service = "cal";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, calActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: calApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ url, headers }) {
    const apiVersion = resolveCalProxyApiVersion(url.pathname);
    if (!apiVersion) throw new ProviderRequestError(400, "cal proxy endpoint is not supported");
    headers.set("cal-api-version", apiVersion);
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return validateCalCredential(input, fetcher, signal);
  },
};
