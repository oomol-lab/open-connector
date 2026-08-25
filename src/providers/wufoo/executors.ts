import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  buildWufooApiBaseUrl,
  createWufooContext,
  normalizeWufooSubdomain,
  validateWufooCredential,
  wufooActionHandlers,
} from "./runtime.ts";

const service = "wufoo";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: wufooActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createWufooContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return buildWufooApiBaseUrl(normalizeWufooSubdomain(credential.values.subdomain));
  },
  auth: { type: "api_key_basic", suffix: ":footastic" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWufooCredential(input.values, input.apiKey, fetcher, signal);
  },
};
