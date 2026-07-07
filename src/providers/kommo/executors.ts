import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { KommoActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { kommoActionHandlers, readKommoApiBaseUrl, validateKommoCredential } from "./runtime.ts";

const service = "kommo";

export const executors: ProviderExecutors = defineProviderExecutors<KommoActionContext>({
  service,
  handlers: kommoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KommoActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: readKommoApiBaseUrl({ ...credential.values, ...credential.metadata }),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Kommo request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return readKommoApiBaseUrl({ ...credential.values, ...credential.metadata });
  },
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateKommoCredential(input, fetcher, signal);
  },
};
