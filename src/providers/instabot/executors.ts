import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { executeInstabotAction, validateInstabotCredential } from "./runtime.ts";

const service = "instabot";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"instabot", Handler> = {
  create_user(input, context) {
    return executeInstabotAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_user",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_user(input, context) {
    return executeInstabotAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_user",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_users(input, context) {
    return executeInstabotAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_users",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_updated_users(input, context) {
    return executeInstabotAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_updated_users",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_user(input, context) {
    return executeInstabotAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_user",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_user(input, context) {
    return executeInstabotAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_user",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  restore_user(input, context) {
    return executeInstabotAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "restore_user",
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
  baseUrl: "https://api.instabot.io/v1",
  auth: { type: "api_key_header", name: "X-Instabot-Api-Key" },
  skipDnsValidation: true,
  customizeRequest({ credential, headers }) {
    if (credential?.authType !== "api_key" || !credential.values.masterApiKey) {
      throw new ProviderRequestError(401, "Configure Instabot API key credentials first.");
    }
    headers.set("authorization", `X-Instabot-Master-Api-Key ${credential.values.masterApiKey}`);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateInstabotCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
