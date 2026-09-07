import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { helium10ActionHandlers, helium10McpEndpoint, validateHelium10Credential } from "./runtime.ts";

const service = "helium10";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, helium10ActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: helium10McpEndpoint,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
  },
});

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return validateHelium10Credential(input.accessToken, fetcher, signal);
  },
};
