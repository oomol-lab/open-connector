import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeInfolobbyAction, infolobbyApiBaseUrl, validateInfolobbyCredential } from "./runtime.ts";

const service = "infolobby";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"infolobby", Handler> = {
  list_spaces(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_spaces",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_space(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_space",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_tables(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_tables",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_table(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_table",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_record(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_record",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_record(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_record",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_record(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_record",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_record(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_record",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  query_records(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "query_records",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  count_records(input, context) {
    return executeInfolobbyAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "count_records",
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
  baseUrl: infolobbyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateInfolobbyCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
