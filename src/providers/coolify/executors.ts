import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { CoolifyContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  coolifyActionHandlers,
  createCoolifyContext,
  normalizeCoolifyApiBaseUrl,
  validateCoolifyCredential,
} from "./runtime.ts";

const service = "coolify";

export const executors: ProviderExecutors = defineProviderExecutors<CoolifyContext>({
  service,
  handlers: coolifyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CoolifyContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createCoolifyContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const value =
      optionalString(credential.metadata.apiBaseUrl) ??
      optionalString(credential.metadata.baseUrl) ??
      optionalString(credential.values.baseUrl);
    if (!value) throw new ProviderRequestError(500, "coolify connection is missing baseUrl metadata");
    return normalizeCoolifyApiBaseUrl(value);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateCoolifyCredential(input.values, input.apiKey, guardedFetcher, signal);
  },
};
