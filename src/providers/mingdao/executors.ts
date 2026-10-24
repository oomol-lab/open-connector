import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { mingdaoActionHandlers, mingdaoApiBaseUrl, validateMingdaoCredential } from "./runtime.ts";

const service = "mingdao";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: mingdaoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      sign: requiredInputString(credential.values.sign, "sign"),
      fetcher,
      signal: context.signal,
    };
  },
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mingdaoApiBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "HAP-Appkey", source: { type: "api_key" } },
      { name: "HAP-Sign", source: { type: "credential_value", name: "sign" } },
    ],
  },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMingdaoCredential(input.apiKey, requiredInputString(input.values.sign, "sign"), fetcher, signal);
  },
};
