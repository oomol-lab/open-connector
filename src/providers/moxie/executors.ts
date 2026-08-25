import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MoxieActionContext } from "./runtime.ts";

import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { moxieActionHandlers, normalizeMoxieBaseUrl, validateMoxieCredential } from "./runtime.ts";

const service = "moxie";

export const executors: ProviderExecutors = defineProviderExecutors<MoxieActionContext>({
  service,
  handlers: moxieActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MoxieActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeMoxieBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMoxieCredential(input, createProviderFetch({ fetch: fetcher }), signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeMoxieBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl);
  },
  auth: { type: "api_key_header", name: "X-API-KEY" },
});
