import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BoldSignActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  boldSignActionHandlers,
  buildBoldSignApiBaseUrl,
  normalizeBoldSignRegion,
  validateBoldSignCredential,
} from "./runtime.ts";

const service = "boldsign";

export const executors: ProviderExecutors = defineProviderExecutors<BoldSignActionContext>({
  service,
  handlers: boldSignActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BoldSignActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const region = normalizeBoldSignRegion(credential.metadata.region ?? credential.values.region);
    return {
      apiBaseUrl: buildBoldSignApiBaseUrl(region),
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBoldSignCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return buildBoldSignApiBaseUrl(normalizeBoldSignRegion(credential.metadata.region ?? credential.values.region));
  },
  auth: { type: "api_key_header", name: "X-API-KEY" },
  allowedOrigins: [
    "https://api.boldsign.com",
    "https://api-eu.boldsign.com",
    "https://api-ca.boldsign.com",
    "https://api-au.boldsign.com",
  ],
});
