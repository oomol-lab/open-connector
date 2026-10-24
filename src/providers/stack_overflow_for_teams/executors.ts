import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  createStackOverflowForTeamsContext,
  stackOverflowForTeamsActionHandlers,
  stackOverflowForTeamsApiBaseUrl,
  validateStackOverflowForTeamsCredential,
} from "./runtime.ts";

const service = "stack_overflow_for_teams";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: stackOverflowForTeamsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createStackOverflowForTeamsContext(
      credential.apiKey,
      credential.values,
      credential.metadata,
      fetcher,
      context.signal,
    );
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: stackOverflowForTeamsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateStackOverflowForTeamsCredential(input.apiKey, input.values, fetcher, signal);
  },
};
