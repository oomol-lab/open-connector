import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { DokployActionContext } from "./runtime.ts";

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
  createDokployContext,
  dokployActionHandlers,
  normalizeDokployApiBaseUrl,
  validateDokployCredential,
} from "./runtime.ts";

const service = "dokploy";

export const executors: ProviderExecutors = defineProviderExecutors<DokployActionContext>({
  service,
  handlers: dokployActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DokployActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createDokployContext(credential.values, credential.apiKey, fetcher, context.signal, context.transitFiles);
  },
  fallbackMessage: "Dokploy request failed",
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
    if (!value) {
      throw new ProviderRequestError(500, "dokploy connection is missing baseUrl metadata");
    }
    return normalizeDokployApiBaseUrl(value);
  },
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    // Re-guard the shared validator fetcher with Dokploy's private-network
    // opt-in so validating a private baseUrl works when the deployment allows
    // it (createProviderFetch unwraps an already-guarded fetcher).
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateDokployCredential(input.values, input.apiKey, guardedFetcher, signal);
  },
};
