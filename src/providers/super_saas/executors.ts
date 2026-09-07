import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeContextFactory } from "../provider-runtime.ts";

import { requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { superSaasActionHandlers, superSaasApiBaseUrl, validateSuperSaasCredential } from "./runtime.ts";

const service = "super_saas";

interface SuperSaasContext extends ApiKeyProviderContext {
  accountName: string;
}

const createSuperSaasContext: ProviderRuntimeContextFactory<SuperSaasContext> = async (
  context: ExecutionContext,
  fetcher,
) => {
  const credential = await requireApiKeyCredential(context, service);
  return {
    apiKey: credential.apiKey,
    accountName: credential.values.accountName ?? String(credential.metadata.accountName ?? ""),
    fetcher,
    signal: context.signal,
    ...(context.transitFiles ? { transitFiles: context.transitFiles } : {}),
  };
};

export const executors: ProviderExecutors = defineProviderExecutors<SuperSaasContext>({
  service,
  handlers: superSaasActionHandlers,
  createContext: createSuperSaasContext,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: superSaasApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  async customizeRequest({ context, url, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    url.searchParams.set("account", requiredString(credential.values.accountName, "accountName", providerInputError));
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSuperSaasCredential(
      {
        apiKey: input.apiKey,
        accountName: input.values.accountName,
      },
      fetcher,
      signal,
    );
  },
};
