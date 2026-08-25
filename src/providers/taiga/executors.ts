import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireCustomCredential,
} from "../provider-runtime.ts";
import {
  applyTaigaProxyAuthorization,
  createTaigaContext,
  normalizeTaigaBaseUrl,
  taigaActionHandlers,
  validateTaigaCredential,
} from "./runtime.ts";

const service = "taiga";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: taigaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return createTaigaContext(credential.values, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, service);
    return normalizeTaigaBaseUrl(credential.values.baseUrl);
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers, fetcher }) {
    const credential = await requireCustomCredential(context, service);
    await applyTaigaProxyAuthorization(credential.values, headers, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateTaigaCredential(input.values, guardedFetcher, signal);
  },
};
