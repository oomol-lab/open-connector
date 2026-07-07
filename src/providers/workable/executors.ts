import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  buildWorkableApiBaseUrl,
  normalizeWorkableSubdomain,
  validateWorkableCredential,
  workableActionHandlers,
} from "./runtime.ts";

const service = "workable";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: workableActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      subdomain: normalizeWorkableSubdomain(credential.values.subdomain),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "workable request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildWorkableApiBaseUrl(normalizeWorkableSubdomain(credential.values.subdomain));
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWorkableCredential(input.apiKey, input.values.subdomain, fetcher, signal);
  },
};
