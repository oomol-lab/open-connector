import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { baiduMapsActionHandlers, baiduMapsApiBaseUrl, validateBaiduMapsCredential } from "./runtime.ts";

const service = "baidu_maps";

export const executors: ProviderExecutors = defineProviderExecutors<BaiduMapsActionContext>({
  service,
  handlers: baiduMapsActionHandlers,
  async createContext(input, fetcher) {
    const credential = await requireApiKeyCredential(input, service);
    return {
      apiKey: credential.apiKey,
      sk: optionalString(credential.values.sk),
      fetcher,
      signal: input.signal,
    };
  },
  fallbackMessage: "Baidu Maps request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: baiduMapsApiBaseUrl,
  auth: { type: "api_key_query", name: "ak" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBaiduMapsCredential({
      apiKey: input.apiKey,
      sk: optionalString(input.values.sk),
      fetcher,
      signal,
    });
  },
};

interface BaiduMapsActionContext {
  apiKey: string;
  sk?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
