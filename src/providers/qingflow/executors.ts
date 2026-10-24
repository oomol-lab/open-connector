import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerUserAgent } from "../provider-runtime.ts";
import { qingflowActionHandlers, qingflowApiBaseUrl, validateQingflowCredential } from "./runtime.ts";

const service = "qingflow";

interface QingflowContext {
  accessToken: string;
  fetcher: typeof fetch;
}

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: qingflowActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<QingflowContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { accessToken: credential.apiKey, fetcher };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateQingflowCredential(input.apiKey, fetcher);
    return {
      profile: { displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: qingflowApiBaseUrl,
  auth: { type: "api_key_header", name: "accessToken" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});
