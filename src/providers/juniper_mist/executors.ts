import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { JuniperMistActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { juniperMistActionHandlers, resolveJuniperMistApiBaseUrl, validateJuniperMistCredential } from "./runtime.ts";

const service = "juniper_mist";

export const executors: ProviderExecutors = defineProviderExecutors<JuniperMistActionContext>({
  service,
  handlers: juniperMistActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<JuniperMistActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveJuniperMistApiBaseUrl(credential.metadata.apiBaseUrl ?? credential.values.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Juniper Mist request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveJuniperMistApiBaseUrl(credential.metadata.apiBaseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateJuniperMistCredential(input, fetcher, signal);
  },
};
