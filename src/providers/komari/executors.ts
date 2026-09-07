import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { KomariActionContext } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  createKomariContext,
  komariActionHandlers,
  normalizeKomariBaseUrl,
  validateKomariCredential,
} from "./runtime.ts";

const service = "komari";

export const executors: ProviderExecutors = defineProviderExecutors<KomariActionContext>({
  service,
  handlers: komariActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KomariActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createKomariContext(
      credential.values,
      credential.apiKey,
      fetcher,
      isPrivateNetworkAccessAllowed(),
      context.signal,
    );
  },
  fallbackMessage: "Komari request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeKomariBaseUrl(credential.values.baseUrl, isPrivateNetworkAccessAllowed());
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateKomariCredential(
      input.values,
      input.apiKey,
      guardedFetcher,
      isPrivateNetworkAccessAllowed(),
      signal,
    );
  },
};
