import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeLineAction, lineApiBaseUrl, validateLineCredential } from "./runtime.ts";

const service = "line";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"line", Handler> = {
  get_bot_info(input, context) {
    return executeLineAction("get_bot_info", input, context.apiKey, context.fetcher);
  },
  get_profile(input, context) {
    return executeLineAction("get_profile", input, context.apiKey, context.fetcher);
  },
  send_push_text(input, context) {
    return executeLineAction("send_push_text", input, context.apiKey, context.fetcher);
  },
  send_multicast_text(input, context) {
    return executeLineAction("send_multicast_text", input, context.apiKey, context.fetcher);
  },
  send_broadcast_text(input, context) {
    return executeLineAction("send_broadcast_text", input, context.apiKey, context.fetcher);
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
  baseUrl: lineApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateLineCredential(input.apiKey, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
