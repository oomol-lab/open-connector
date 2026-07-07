import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OrttoContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { orttoActionHandlers, resolveOrttoApiBaseUrl, validateOrttoCredential } from "./runtime.ts";

const service = "ortto";

export const executors: ProviderExecutors = defineProviderExecutors<OrttoContext>({
  service,
  handlers: orttoActionHandlers,
  async createContext(context, fetcher): Promise<OrttoContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      region: optionalString(credential.values.region) ?? optionalString(credential.metadata.region),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context): Promise<string> {
    const credential = await requireApiKeyCredential(context, service);
    return resolveOrttoApiBaseUrl(
      optionalString(credential.values.region) ?? optionalString(credential.metadata.region),
    );
  },
  auth: { type: "api_key_header", name: "X-Api-Key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOrttoCredential(input, fetcher, signal);
  },
};
