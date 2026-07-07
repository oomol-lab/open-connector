import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  normalizePlausibleBaseUrl,
  plausibleAnalyticsActionHandlers,
  plausibleDefaultBaseUrl,
  validatePlausibleAnalyticsCredential,
} from "./runtime.ts";

const service = "plausible_analytics";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: plausibleAnalyticsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      siteId: optionalString(credential.values.siteId) ?? optionalString(credential.metadata.siteId),
      baseUrl: optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validatePlausibleAnalyticsCredential(
      input.apiKey,
      optionalString(input.values.siteId),
      optionalString(input.values.baseUrl),
      fetcher,
      signal,
    );
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: plausibleAnalyticsProxyBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

async function plausibleAnalyticsProxyBaseUrl(context: ExecutionContext): Promise<string> {
  const credential = await requireApiKeyCredential(context, service);
  return normalizePlausibleBaseUrl(
    optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl) ?? plausibleDefaultBaseUrl,
  );
}
