import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { kintoneActionHandlers, resolveKintoneApiBaseUrl, validateKintoneCredential } from "./runtime.ts";

const service = "kintone";

interface KintoneRuntimeContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

export const executors: ProviderExecutors = defineProviderExecutors<KintoneRuntimeContext>({
  service,
  handlers: kintoneActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KintoneRuntimeContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure kintone API key credentials first.");
    }
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveKintoneApiBaseUrl(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveKintoneApiBaseUrl(credential.values);
  },
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKintoneCredential({ ...input.values, apiKey: input.apiKey }, fetcher, signal);
  },
};
