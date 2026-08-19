import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeVidaAction, validateVidaCredential, vidaApiBaseUrl } from "./runtime.ts";

const service = "vida";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"vida", Handler> = {
  get_account(input, context) {
    return executeVidaAction(
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
  list_tasks(input, context) {
    return executeVidaAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_tasks",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_task(input, context) {
    return executeVidaAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_task",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_task_statistics(input, context) {
    return executeVidaAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_task_statistics",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_daily_counts(input, context) {
    return executeVidaAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_daily_counts",
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
  baseUrl: vidaApiBaseUrl,
  auth: { type: "api_key_query", name: "token" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateVidaCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
