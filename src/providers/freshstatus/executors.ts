import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  freshstatusActionHandlers,
  freshstatusApiBaseUrl,
  freshstatusAuthorization,
  resolveFreshstatusCredential,
  validateFreshstatusCredential,
} from "./runtime.ts";

const service = "freshstatus";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: freshstatusActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      ...resolveFreshstatusCredential(credential.apiKey, credential.values.subdomain ?? credential.metadata.subdomain),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Freshstatus request failed",
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: freshstatusApiBaseUrl,
  auth: { type: "api_key_header", name: "authorization" },
  customizeRequest({ credential, headers }) {
    if (credential?.authType !== "api_key") return;
    const resolved = resolveFreshstatusCredential(
      credential.apiKey,
      credential.values.subdomain ?? credential.metadata.subdomain,
    );
    headers.set("authorization", freshstatusAuthorization(resolved));
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credential = resolveFreshstatusCredential(input.apiKey, input.values.subdomain);
    await validateFreshstatusCredential(credential, fetcher, signal);
    return {
      profile: {
        accountId: `freshstatus:${credential.subdomain}`,
        displayName: `Freshstatus ${credential.subdomain}`,
      },
      grantedScopes: [],
      metadata: {
        subdomain: credential.subdomain,
        apiBaseUrl: freshstatusApiBaseUrl,
        validationEndpoint: "/api/v1/",
      },
    };
  },
};
