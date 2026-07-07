import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import {
  credentialProviderProxyBaseUrl,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { createPrtgClassicActionContext, prtgClassicActionHandlers, validatePrtgClassicCredential } from "./runtime.ts";

const service = "prtg_classic";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: prtgClassicActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createPrtgClassicActionContext({
      apiKey: credential.apiKey,
      metadata: credential.metadata,
      fetcher,
      signal: context.signal,
    });
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: credentialProviderProxyBaseUrl("apiBaseUrl"),
  auth: { type: "api_key_query", name: "apitoken" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validatePrtgClassicCredential({
      apiKey: input.apiKey,
      values: input.values,
      fetcher,
      signal,
    });
  },
};
