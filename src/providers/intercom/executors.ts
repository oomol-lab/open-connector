import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { IntercomActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireOAuthCredential } from "../provider-runtime.ts";
import {
  intercomActionHandlers,
  intercomAllowedApiBaseUrls,
  intercomApiVersion,
  resolveIntercomApiBaseUrl,
  validateIntercomOAuthCredential,
} from "./runtime.ts";

const service = "intercom";

export const executors: ProviderExecutors = defineProviderExecutors<IntercomActionContext>({
  service,
  handlers: intercomActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<IntercomActionContext> {
    const credential = await requireOAuthCredential(context, service);
    return {
      accessToken: credential.accessToken,
      fetcher,
      providerMetadata: credential.metadata,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireOAuthCredential(context, service);
    return resolveIntercomApiBaseUrl(credential.metadata);
  },
  allowedOrigins: intercomAllowedApiBaseUrls,
  auth: { type: "oauth_bearer" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("Intercom-Version", intercomApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    return validateIntercomOAuthCredential(input, fetcher, signal);
  },
};
