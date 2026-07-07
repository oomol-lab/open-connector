import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { CertnProviderContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { certnActionHandlers, resolveCertnBaseUrl, validateCertnCredential } from "./runtime.ts";

const service = "certn";

export const executors: ProviderExecutors = defineProviderExecutors<CertnProviderContext>({
  service,
  handlers: certnActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<CertnProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    const providerContext: CertnProviderContext = {
      apiKey: credential.apiKey,
      baseUrl: resolveCertnBaseUrl(credential.metadata, credential.values),
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
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveCertnBaseUrl(credential.metadata, credential.values);
  },
  auth: { type: "api_key_authorization", prefix: "Api-Key " },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateCertnCredential,
};
