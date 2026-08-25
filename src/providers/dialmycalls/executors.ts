import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { dialMyCallsApiBaseUrl, executeDialMyCallsAction, validateDialMyCallsCredential } from "./runtime.ts";

const service = "dialmycalls";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"dialmycalls", Handler> = {
  get_account(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_account",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_contact(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_contact",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_contact(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_contact",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_contact(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_contact",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_contact(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_contact",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_contacts(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_contacts",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_group_contacts(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_group_contacts",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_group(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_group",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_group(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_group",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_group(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_group",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_group(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_group",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_groups(input, context) {
    return executeDialMyCallsAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_groups",
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
  baseUrl: dialMyCallsApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateDialMyCallsCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
