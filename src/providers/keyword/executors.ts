import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { KeywordRequestContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { keywordActionHandlers, keywordApiBaseUrl, validateKeywordCredential } from "./runtime.ts";

const service = "keyword";

export const executors: ProviderExecutors = defineProviderExecutors<KeywordRequestContext>({
  service,
  handlers: keywordActionHandlers,
  async createContext(context, fetcher): Promise<KeywordRequestContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      phase: "execute",
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: keywordApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKeywordCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
