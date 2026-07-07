import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  getOpsgenieApiBaseUrl,
  opsgenieActionHandlers,
  resolveOpsgenieEnvironment,
  validateOpsgenieCredential,
} from "./runtime.ts";

const service = "opsgenie";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: opsgenieActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      environment: credential.metadata.environment ?? credential.values.environment,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return getOpsgenieApiBaseUrl(
      resolveOpsgenieEnvironment(credential.metadata.environment ?? credential.values.environment),
    );
  },
  auth: {
    type: "api_key_authorization",
    prefix: "GenieKey ",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOpsgenieCredential(
      {
        apiKey: input.apiKey,
        environment: input.values.environment,
      },
      fetcher,
      signal,
    );
  },
};
