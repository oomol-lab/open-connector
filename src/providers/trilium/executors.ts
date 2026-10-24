import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { TriliumContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import {
  createTriliumContext,
  normalizeTriliumBaseUrl,
  triliumActionHandlers,
  validateTriliumCredential,
} from "./runtime.ts";

const service = "trilium";

export const executors: ProviderExecutors = defineProviderExecutors<TriliumContext>({
  service,
  handlers: triliumActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<TriliumContext> {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl);
    return createTriliumContext(credential.apiKey, baseUrl, fetcher, context.signal);
  },
  fallbackMessage: "Trilium request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl);
    if (!baseUrl) throw new ProviderRequestError(500, "trilium connection is missing baseUrl metadata");
    return normalizeTriliumBaseUrl(baseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateTriliumCredential(input.apiKey, input.values.baseUrl, guardedFetcher, signal);
  },
};
