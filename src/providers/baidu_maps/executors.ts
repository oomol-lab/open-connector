import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { BaiduMapsActionContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  baiduMapsActionHandlers,
  baiduMapsApiBaseUrl,
  signBaiduMapsProxyUrl,
  validateBaiduMapsCredential,
} from "./runtime.ts";

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
  // Sign SN-validated endpoints on the raw proxy path too, so an SK-configured
  // account behaves the same through the proxy as through the action handlers.
  customizeRequest({ url, credential }) {
    const sk = credential && "values" in credential ? optionalString(credential.values.sk) : undefined;
    signBaiduMapsProxyUrl(url, sk);
  },
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
