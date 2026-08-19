import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeProductlaneAction, productlaneApiBaseUrl, validateProductlaneCredential } from "./runtime.ts";

const service = "productlane";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"productlane", Handler> = {
  get_authenticated_identity(input, context) {
    return executeProductlaneAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_authenticated_identity",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_companies(input, context) {
    return executeProductlaneAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_companies",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_company(input, context) {
    return executeProductlaneAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_company",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_company(input, context) {
    return executeProductlaneAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_company",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_company(input, context) {
    return executeProductlaneAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_company",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_company(input, context) {
    return executeProductlaneAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_company",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_contacts(input, context) {
    return executeProductlaneAction(
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
  create_contact(input, context) {
    return executeProductlaneAction(
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
    return executeProductlaneAction(
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
    return executeProductlaneAction(
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
    return executeProductlaneAction(
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
  baseUrl: productlaneApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateProductlaneCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
