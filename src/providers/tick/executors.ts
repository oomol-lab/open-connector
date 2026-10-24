import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError } from "../provider-runtime.ts";
import { buildTickApiBaseUrl, handlers, resolveTickCredential, validateTickCredential } from "./runtime.ts";

const service = "tick";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      credential: resolveTickCredential({
        apiKey: credential.apiKey,
        subscriptionId: credential.values.subscriptionId ?? optionalString(credential.metadata?.subscriptionId) ?? "",
        email: credential.values.email ?? optionalString(credential.metadata?.email) ?? "",
      }),
      fetcher,
      signal: context.signal,
    };
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTickCredential(
      { apiKey: input.apiKey, subscriptionId: input.values.subscriptionId ?? "", email: input.values.email ?? "" },
      fetcher,
      signal,
    );
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    const subscriptionId = credential.values.subscriptionId ?? optionalString(credential.metadata?.subscriptionId);
    if (!subscriptionId) throw providerInputError("Tick subscriptionId metadata is missing");
    return buildTickApiBaseUrl(subscriptionId);
  },
  auth: {
    type: "credential_headers",
    headers: [
      { name: "authorization", source: { type: "api_key" }, prefix: "Token token=" },
      {
        name: "user-agent",
        source: { type: "credential_value", name: "email" },
        prefix: "oomol-connect (",
        suffix: ")",
      },
    ],
  },
  skipDnsValidation: true,
});
