import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { normalizePlaneApiBaseUrl, planeActionHandlers, validatePlaneCredential } from "./runtime.ts";

const service = "plane";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: planeActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: optionalString(credential.values.apiBaseUrl) ?? optionalString(credential.metadata.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizePlaneApiBaseUrl(
      optionalString(credential.values.apiBaseUrl) ?? optionalString(credential.metadata.apiBaseUrl),
    );
  },
  auth: { type: "api_key_header", name: "X-API-Key" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validatePlaneCredential(input.apiKey, optionalString(input.values.apiBaseUrl), guardedFetcher, signal);
  },
};
