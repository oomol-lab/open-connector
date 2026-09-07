import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { XataContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { validateXataCredential, xataActionHandlers, xataApiBaseUrl } from "./runtime.ts";

const service = "xata";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: xataApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineProviderExecutors<XataContext>({
  service,
  handlers: xataActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<XataContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateXataCredential(input.apiKey, fetcher, signal);
  },
};
