import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MailcoachActionContext } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import {
  mailcoachActionHandlers,
  normalizeMailcoachBaseUrl,
  resolveMailcoachProxyBaseUrl,
  validateMailcoachCredential,
} from "./runtime.ts";

const service = "mailcoach";

export const executors: ProviderExecutors = defineProviderExecutors<MailcoachActionContext>({
  service,
  handlers: mailcoachActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeMailcoachBaseUrl(credential.values.baseUrl || String(credential.metadata.baseUrl || "")),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveMailcoachProxyBaseUrl({
      ...credential.metadata,
      ...credential.values,
    });
  },
  auth: { type: "bearer" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMailcoachCredential(
      input.apiKey,
      input.values.baseUrl,
      createProviderFetch({
        fetch: fetcher,
        allowPrivateNetwork: isPrivateNetworkAccessAllowed,
      }),
      signal,
    );
  },
};
