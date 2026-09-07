import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  executeSplunkHttpEventCollectorAction,
  normalizeSplunkHecBaseUrl,
  validateSplunkHttpEventCollectorCredential,
} from "./runtime.ts";

const service = "splunk_http_event_collector";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"splunk_http_event_collector", Handler> = {
  send_event(input, context) {
    return executeSplunkHttpEventCollectorAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "send_event",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  send_raw_event(input, context) {
    return executeSplunkHttpEventCollectorAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "send_raw_event",
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
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, values: credential.values, metadata: credential.metadata, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeSplunkHecBaseUrl(
      credential.metadata.baseUrl ?? credential.values.baseUrl,
      isPrivateNetworkAccessAllowed(),
    );
  },
  auth: { type: "api_key_authorization", prefix: "Splunk " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const privateNetworkFetch = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    const result = await validateSplunkHttpEventCollectorCredential(
      { apiKey: input.apiKey, ...input.values },
      privateNetworkFetch,
    );
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
