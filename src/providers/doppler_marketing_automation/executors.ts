import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  dopplerMarketingAutomationApiBaseUrl,
  executeDopplerMarketingAutomationAction,
  validateDopplerMarketingAutomationCredential,
} from "./runtime.ts";

const service = "doppler_marketing_automation";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"doppler_marketing_automation", Handler> = {
  list_lists(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_lists",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_list(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_list",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_list(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_list",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_list(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_list",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_list(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_list",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_subscribers(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_subscribers",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_list_subscribers(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_list_subscribers",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_subscriber(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_subscriber",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  add_subscriber_to_list(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "add_subscriber_to_list",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  remove_subscriber_from_list(input, context) {
    return executeDopplerMarketingAutomationAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "remove_subscriber_from_list",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, values: credential.values, metadata: credential.metadata, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dopplerMarketingAutomationApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "token " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateDopplerMarketingAutomationCredential(
      { apiKey: input.apiKey, ...input.values },
      fetcher,
    );
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
