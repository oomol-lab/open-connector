import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { makeActionHandlers, makeProxyBaseUrl, resolveMakeZoneUrl, validateMakeCredential } from "./runtime.ts";

const service = "make";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: makeActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      zoneUrl: resolveMakeZoneUrl(credential),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return makeProxyBaseUrl(credential.metadata);
  },
  auth: { type: "api_key_authorization", prefix: "Token " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMakeCredential(
      {
        apiKey: input.apiKey,
        zoneUrl: input.values.zoneUrl,
      },
      fetcher,
      signal,
    );
  },
};
