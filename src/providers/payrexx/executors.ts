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
import { executePayrexxAction, payrexxApiBaseUrl, validatePayrexxCredential } from "./runtime.ts";

const service = "payrexx";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"payrexx", Handler> = {
  list_payment_providers(input, context) {
    return executePayrexxAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_payment_providers",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_transactions(input, context) {
    return executePayrexxAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_transactions",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_transaction(input, context) {
    return executePayrexxAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_transaction",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_gateway(input, context) {
    return executePayrexxAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_gateway",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_gateway(input, context) {
    return executePayrexxAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_gateway",
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
  baseUrl: payrexxApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ credential, url }) {
    if (credential?.authType !== "api_key" || !credential.values.instance) {
      throw new ProviderRequestError(401, "Configure Payrexx instance and API key credentials first.");
    }
    url.searchParams.set("instance", credential.values.instance);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validatePayrexxCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
