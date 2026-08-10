import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  credentialProviderProxyBaseUrl,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { normalizeSimlaApiBaseUrl, simlaActionHandlers, validateSimlaCredential } from "./runtime.ts";

const service = "simla";

interface SimlaContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

export const executors: ProviderExecutors = defineProviderExecutors<SimlaContext>({
  service,
  handlers: simlaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<SimlaContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizeSimlaApiBaseUrl(credential.values.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSimlaCredential(input.apiKey, input.values, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: credentialProviderProxyBaseUrl("apiBaseUrl"),
  auth: { type: "api_key_header", name: "x-api-key" },
});
