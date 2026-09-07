import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BusinessmapContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { businessmapActionHandlers, normalizeBusinessmapAccountUrl, validateBusinessmapCredential } from "./runtime.ts";

const service = "businessmap";

export const executors: ProviderExecutors = defineProviderExecutors<BusinessmapContext>({
  service,
  handlers: businessmapActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BusinessmapContext> {
    const credential = await requireApiKeyCredential(context, service);
    const apiBaseUrl =
      optionalString(credential.metadata.apiBaseUrl) ??
      normalizeBusinessmapAccountUrl(credential.values.accountUrl).apiBaseUrl;
    return {
      apiKey: credential.apiKey,
      apiBaseUrl,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeBusinessmapAccountUrl(
      optionalString(credential.metadata.apiBaseUrl) ?? credential.values.accountUrl,
    ).apiBaseUrl;
  },
  auth: { type: "api_key_header", name: "apikey" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBusinessmapCredential(input.apiKey, input.values.accountUrl, fetcher, signal);
  },
};
