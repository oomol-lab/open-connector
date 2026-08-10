import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { EncodianContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { encodianActionHandlers, resolveEncodianApiBaseUrl, validateEncodianCredential } from "./runtime.ts";

const service = "encodian";

export const executors: ProviderExecutors = defineProviderExecutors<EncodianContext>({
  service,
  handlers: encodianActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<EncodianContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveEncodianApiBaseUrl(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEncodianCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.apps-encodian.com",
  auth: { type: "api_key_header", name: "x-apikey" },
});
