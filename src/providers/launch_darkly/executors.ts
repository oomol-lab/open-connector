import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  launchDarklyActionHandlers,
  launchDarklyApiBaseUrl,
  launchDarklyApiVersion,
  validateLaunchDarklyCredential,
} from "./runtime.ts";

const service = "launch_darkly";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, launchDarklyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: launchDarklyApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("ld-api-version", launchDarklyApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLaunchDarklyCredential(input.apiKey, fetcher, signal);
  },
};
