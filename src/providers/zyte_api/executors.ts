import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ZyteApiContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { validateZyteApiCredential, zyteApiActionHandlers, zyteApiBaseUrl } from "./runtime.ts";

const service = "zyte_api";

export const executors: ProviderExecutors = defineProviderExecutors<ZyteApiContext>({
  service,
  handlers: zyteApiActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ZyteApiContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zyteApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateZyteApiCredential(input.apiKey, fetcher, signal);
  },
};
