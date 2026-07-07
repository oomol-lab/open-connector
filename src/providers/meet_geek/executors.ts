import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { meetGeekActionHandlers, meetGeekApiBaseUrls, validateMeetGeekCredential } from "./runtime.ts";

const service = "meet_geek";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, meetGeekActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: meetGeekApiBaseUrls.default,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateMeetGeekCredential,
};
