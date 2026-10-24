import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { TuskrActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { resolveTuskrTenantId, tuskrActionHandlers, tuskrApiBaseUrl, validateTuskrCredential } from "./runtime.ts";

const service = "tuskr";

export const executors: ProviderExecutors = defineProviderExecutors<TuskrActionContext>({
  service,
  handlers: tuskrActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<TuskrActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      accessToken: credential.apiKey,
      tenantId: resolveTuskrTenantId(credential.metadata.tenantId ?? credential.values.tenantId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tuskrApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTuskrCredential,
};
