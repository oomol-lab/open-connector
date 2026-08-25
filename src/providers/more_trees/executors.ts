import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeMoreTreesAction, validateMoreTreesCredential } from "./runtime.ts";

const service = "more_trees";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"more_trees", Handler> = {
  get_account(input, context) {
    return executeMoreTreesAction(
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
  get_forest(input, context) {
    return executeMoreTreesAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_forest",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_projects(input, context) {
    return executeMoreTreesAction(
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
  plant_trees(input, context) {
    return executeMoreTreesAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "plant_trees",
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
    const result = await validateMoreTreesCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
