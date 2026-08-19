import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { leadiqActionHandlers, leadiqApiBaseUrl, validateLeadiqCredential } from "./runtime.ts";

const service = "leadiq";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"leadiq", Handler> = {
  get_account(input, context) {
    return leadiqActionHandlers["get_account"](
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
  search_people(input, context) {
    return leadiqActionHandlers["search_people"](
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "search_people",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  search_company(input, context) {
    return leadiqActionHandlers["search_company"](
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "search_company",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  flat_advanced_search(input, context) {
    return leadiqActionHandlers["flat_advanced_search"](
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "flat_advanced_search",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  grouped_advanced_search(input, context) {
    return leadiqActionHandlers["grouped_advanced_search"](
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "grouped_advanced_search",
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
  baseUrl: leadiqApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Basic " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateLeadiqCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
