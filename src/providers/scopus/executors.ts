import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ScopusContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { scopusActionHandlers, scopusApiBaseUrl, validateScopusCredential } from "./runtime.ts";

const service = "scopus";

export const executors: ProviderExecutors = defineProviderExecutors<ScopusContext>({
  service,
  handlers: scopusActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ScopusContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      institutionToken: optionalString(credential.values.institutionToken),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: scopusApiBaseUrl,
  auth: { type: "api_key_header", name: "x-els-apikey" },
  customizeRequest({ headers, credential }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    headers.delete("x-els-insttoken");
    if (credential?.authType !== "api_key") {
      return;
    }
    const institutionToken = optionalString(credential.values.institutionToken);
    if (institutionToken) {
      headers.set("x-els-insttoken", institutionToken);
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateScopusCredential(input.apiKey, optionalString(input.values.institutionToken), fetcher, signal);
  },
};
