import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { FreshteamActionContext } from "./runtime.ts";

import {
  credentialProviderProxyBaseUrl,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { freshteamActionHandlers, resolveFreshteamBaseUrl, validateFreshteamCredential } from "./runtime.ts";

const service = "freshteam";

export const executors: ProviderExecutors = defineProviderExecutors<FreshteamActionContext>({
  service,
  handlers: freshteamActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FreshteamActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveFreshteamBaseUrl(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: credentialProviderProxyBaseUrl("baseUrl"),
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFreshteamCredential(input.apiKey, input.values, fetcher, signal);
  },
};
