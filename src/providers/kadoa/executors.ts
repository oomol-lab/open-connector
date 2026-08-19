import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeKadoaAction, kadoaApiBaseUrl, validateKadoaCredential } from "./runtime.ts";

const service = "kadoa";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"kadoa", Handler> = {
  list_workflows(input, context) {
    return executeKadoaAction("list_workflows", input, context.apiKey, context.fetcher);
  },
  get_workflow(input, context) {
    return executeKadoaAction("get_workflow", input, context.apiKey, context.fetcher);
  },
  get_workflow_data(input, context) {
    return executeKadoaAction("get_workflow_data", input, context.apiKey, context.fetcher);
  },
  export_workflow_data(input, context) {
    return executeKadoaAction("export_workflow_data", input, context.apiKey, context.fetcher);
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
  baseUrl: kadoaApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateKadoaCredential(input.apiKey, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
