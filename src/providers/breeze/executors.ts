import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  breezeActionHandlers,
  buildBreezeBaseUrl,
  normalizeBreezeBaseUrl,
  normalizeBreezeSubdomain,
  validateBreezeCredential,
} from "./runtime.ts";

const service = "breeze";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: breezeActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const subdomain = normalizeBreezeSubdomain(credential.values.subdomain ?? credential.metadata.subdomain);
    const baseUrl = normalizeBreezeBaseUrl(credential.metadata.baseUrl) ?? buildBreezeBaseUrl(subdomain);

    return {
      apiKey: credential.apiKey,
      subdomain,
      baseUrl,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Breeze request failed.",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context): Promise<string> {
    const credential = await requireApiKeyCredential(context, service);
    const subdomain = normalizeBreezeSubdomain(credential.values.subdomain ?? credential.metadata.subdomain);
    return normalizeBreezeBaseUrl(credential.metadata.baseUrl) ?? buildBreezeBaseUrl(subdomain);
  },
  auth: { type: "api_key_header", name: "Api-key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBreezeCredential(input.apiKey, input.values, fetcher, signal);
  },
};
