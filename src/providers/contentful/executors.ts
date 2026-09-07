import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  contentfulActionHandlers,
  contentfulApiBaseUrl,
  contentfulJsonContentType,
  validateContentfulCredential,
} from "./runtime.ts";

const service = "contentful";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, contentfulActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: contentfulApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", contentfulJsonContentType);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateContentfulCredential(input.apiKey, fetcher, signal);
  },
};
