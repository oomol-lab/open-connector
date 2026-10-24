import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { GleapActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { gleapActionHandlers, gleapApiBaseUrl, resolveGleapProjectId, validateGleapCredential } from "./runtime.ts";

const service = "gleap";

export const executors: ProviderExecutors = defineProviderExecutors<GleapActionContext>({
  service,
  handlers: gleapActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GleapActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      projectId: resolveGleapProjectId(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gleapApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ credential, headers }) {
    if (credential?.authType !== "api_key") {
      return;
    }
    headers.set("Project", resolveGleapProjectId(credential.values, credential.metadata));
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateGleapCredential(input, fetcher, signal);
  },
};
