import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { OnePasswordEventsContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  onePasswordEventsActionHandlers,
  resolveOnePasswordEventsBaseUrl,
  resolveOnePasswordEventsCredentialContext,
  validateOnePasswordEventsCredential,
} from "./runtime.ts";

const service = "one_password_events";

export const executors: ProviderExecutors = defineProviderExecutors<OnePasswordEventsContext>({
  service,
  handlers: onePasswordEventsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OnePasswordEventsContext> {
    const credential = await requireApiKeyCredential(context, service);
    return resolveOnePasswordEventsCredentialContext(
      credential.apiKey,
      credential.values,
      credential.metadata,
      fetcher,
      context.signal,
    );
  },
  fallbackMessage: "one_password_events request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveOnePasswordEventsBaseUrl(credential.values, credential.metadata);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOnePasswordEventsCredential(input.apiKey, input.values, fetcher, signal);
  },
};
