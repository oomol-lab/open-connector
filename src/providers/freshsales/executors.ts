import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { FreshsalesActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { freshsalesActionHandlers, resolveFreshsalesBaseUrl, validateFreshsalesCredential } from "./runtime.ts";

const service = "freshsales";

export const executors: ProviderExecutors = defineProviderExecutors<FreshsalesActionContext>({
  service,
  handlers: freshsalesActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FreshsalesActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveFreshsalesBaseUrl(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveFreshsalesBaseUrl(credential.values, credential.metadata);
  },
  auth: { type: "api_key_authorization", prefix: "Token token=" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFreshsalesCredential(input.apiKey, input.values, fetcher, signal);
  },
};
