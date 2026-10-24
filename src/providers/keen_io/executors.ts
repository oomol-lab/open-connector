import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { KeenIoContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { keenIoActionHandlers, keenIoApiBaseUrl, requireProjectId, validateKeenIoCredential } from "./runtime.ts";

const service = "keen_io";

export const executors: ProviderExecutors = defineProviderExecutors<KeenIoContext>({
  service,
  handlers: keenIoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KeenIoContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      projectId: requireProjectId(credential.values.projectId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateKeenIoCredential(input.apiKey, input.values.projectId, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: keenIoApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
});
