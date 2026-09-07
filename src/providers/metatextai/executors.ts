import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  createMetatextaiContext,
  metatextaiActionHandlers,
  metatextaiApiBaseUrl,
  validateMetatextaiCredential,
} from "./runtime.ts";

const service = "metatextai";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: metatextaiActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createMetatextaiContext(credential.apiKey, credential.values.applicationId, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: metatextaiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMetatextaiCredential(input.apiKey, input.values.applicationId, fetcher, signal);
  },
};
