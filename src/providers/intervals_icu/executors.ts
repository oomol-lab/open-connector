import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, providerProxyEndpointPrefixes } from "../provider-proxy.ts";
import {
  intervalsIcuActionHandlers,
  intervalsIcuApiBaseUrl,
  intervalsIcuApiPathPrefix,
  intervalsIcuAuthorization,
  readIntervalsIcuError,
  validateIntervalsIcuApiKey,
} from "./runtime.ts";

const service = "intervals_icu";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, intervalsIcuActionHandlers, {
  skipDnsValidation: true,
});

// The shared api_key_basic auth puts the key in the user name; Intervals.icu
// wants the fixed user name API_KEY with the key as the password.
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: intervalsIcuApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  allowedEndpoint: providerProxyEndpointPrefixes(intervalsIcuApiPathPrefix),
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("authorization", intervalsIcuAuthorization(credential.apiKey));
  },
  readError: readIntervalsIcuError,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateIntervalsIcuApiKey(input.apiKey, fetcher, signal);
  },
};
