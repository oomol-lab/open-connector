import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { KandjiActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { kandjiActionHandlers, normalizeKandjiApiUrl, validateKandjiCredential } from "./runtime.ts";

const service = "kandji";

export const executors: ProviderExecutors = defineProviderExecutors<KandjiActionContext>({
  service,
  handlers: kandjiActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KandjiActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiUrl: normalizeKandjiApiUrl(credential.metadata.apiUrl ?? credential.values.apiUrl),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Kandji request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeKandjiApiUrl(credential.metadata.apiUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateKandjiCredential(input, fetcher, signal);
  },
};
