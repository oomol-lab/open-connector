import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  sellerSpriteActionHandlers,
  sellerSpriteApiBaseUrl,
  toSellerSpriteExecutionError,
  validateSellerSpriteCredential,
} from "./runtime.ts";

const service = "sellersprite";

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: sellerSpriteActionHandlers,
  skipDnsValidation: true,
  mapError: toSellerSpriteExecutionError,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    const providerContext: ApiKeyProviderContext = {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) {
      providerContext.transitFiles = context.transitFiles;
    }
    return providerContext;
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sellerSpriteApiBaseUrl,
  auth: { type: "api_key_header", name: "secret-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json;charset=UTF-8");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSellerSpriteCredential(input.apiKey, fetcher, signal);
  },
};
