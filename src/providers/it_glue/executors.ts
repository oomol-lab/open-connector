import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { itGlueActionHandlers, resolveItGlueApiBaseUrl, validateItGlueCredential } from "./runtime.ts";

const service = "it_glue";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: itGlueActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveItGlueApiBaseUrl(
        optionalString(credential.values.region) ?? optionalString(credential.metadata.region),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveItGlueApiBaseUrl(
      optionalString(credential.values.region) ?? optionalString(credential.metadata.region),
    );
  },
  auth: {
    type: "api_key_header",
    name: "x-api-key",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateItGlueCredential,
};
