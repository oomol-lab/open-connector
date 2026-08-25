import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeClickhelpAction, validateClickhelpCredential } from "./runtime.ts";

const service = "clickhelp";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"clickhelp", Handler> = {
  list_projects(input, context) {
    return executeClickhelpAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_projects",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_project(input, context) {
    return executeClickhelpAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_project",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_topics(input, context) {
    return executeClickhelpAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_topics",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_topic(input, context) {
    return executeClickhelpAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_topic",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_topic(input, context) {
    return executeClickhelpAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_topic",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_topic(input, context) {
    return executeClickhelpAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_topic",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  search_portal(input, context) {
    return executeClickhelpAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "search_portal",
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

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateClickhelpCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
