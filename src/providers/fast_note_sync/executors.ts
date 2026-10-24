import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { FastNoteSyncContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import {
  createFastNoteSyncContext,
  fastNoteSyncActionHandlers,
  normalizeFastNoteSyncBaseUrl,
  validateFastNoteSyncCredential,
} from "./runtime.ts";

const service = "fast_note_sync";

export const executors: ProviderExecutors = defineProviderExecutors<FastNoteSyncContext>({
  service,
  handlers: fastNoteSyncActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FastNoteSyncContext> {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl);
    return createFastNoteSyncContext(credential.apiKey, baseUrl, fetcher, context.signal, context.transitFiles);
  },
  fallbackMessage: "FNS request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl);
    if (!baseUrl) {
      throw new ProviderRequestError(500, "fast_note_sync connection is missing baseUrl metadata");
    }
    return normalizeFastNoteSyncBaseUrl(baseUrl);
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
    return validateFastNoteSyncCredential(input.apiKey, input.values.baseUrl, guardedFetcher, signal);
  },
};
