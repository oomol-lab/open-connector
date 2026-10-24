import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { PermitIoContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { permitIoActionHandlers, permitIoApiBaseUrl, validatePermitIoCredential } from "./runtime.ts";

const service = "permit_io";

export const executors: ProviderExecutors = defineProviderExecutors<PermitIoContext>({
  service,
  handlers: permitIoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<PermitIoContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      metadata: credential.metadata,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePermitIoCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: permitIoApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});
