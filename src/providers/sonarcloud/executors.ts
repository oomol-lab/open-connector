import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { SonarCloudActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { resolveSonarCloudApiBaseUrl, sonarCloudActionHandlers, validateSonarCloudCredential } from "./runtime.ts";

const service = "sonarcloud";

export const executors: ProviderExecutors = defineProviderExecutors<SonarCloudActionContext>({
  service,
  handlers: sonarCloudActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SonarCloudActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveSonarCloudApiBaseUrl(credential.metadata.apiBaseUrl ?? credential.values.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "SonarQube Cloud request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveSonarCloudApiBaseUrl(credential.metadata.apiBaseUrl ?? credential.values.apiBaseUrl);
  },
  auth: { type: "bearer" },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateSonarCloudCredential,
};
