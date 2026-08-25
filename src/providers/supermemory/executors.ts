import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeSupermemoryAction, supermemoryApiBaseUrl, validateSupermemoryApiKey } from "./runtime.ts";

const service = "supermemory";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"supermemory", Handler> = {
  create_memories(input, context) {
    return executeSupermemoryAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_memories",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  add_document(input, context) {
    return executeSupermemoryAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "add_document",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_document(input, context) {
    return executeSupermemoryAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_document",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  search(input, context) {
    return executeSupermemoryAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "search",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_profile(input, context) {
    return executeSupermemoryAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_profile",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_memory(input, context) {
    return executeSupermemoryAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_memory",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  forget_memory(input, context) {
    return executeSupermemoryAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "forget_memory",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_document(input, context) {
    return executeSupermemoryAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_document",
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
  baseUrl: supermemoryApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateSupermemoryApiKey(input.apiKey, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
