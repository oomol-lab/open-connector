import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { normalizeOutlineBaseUrl, outlineActionHandlers, validateOutlineCredential } from "./runtime.ts";

const service = "outline";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: outlineActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizeOutlineBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeOutlineBaseUrl(
      credential.metadata.baseUrl ?? credential.values.baseUrl,
      isPrivateNetworkAccessAllowed(),
    );
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOutlineCredential(
      {
        apiKey: input.apiKey,
        baseUrl: input.values.baseUrl,
      },
      fetcher,
      signal,
    );
  },
};
