import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  mapProviderActionSources,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  centralStationCrmActionHandlers,
  readCentralStationCrmApiBaseUrl,
  validateCentralStationCrmCredential,
} from "./runtime.ts";

const service = "central_station_crm";

interface CentralStationCrmExecutorContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const centralStationCrmExecutorHandlers = mapProviderActionSources(
  service,
  centralStationCrmActionHandlers,
  (actionName, handler) => (input: Record<string, unknown>, context: CentralStationCrmExecutorContext) =>
    handler(
      {
        actionName,
        apiKey: context.apiKey,
        providerMetadata: {
          apiBaseUrl: context.apiBaseUrl,
        },
        input,
        signal: context.signal,
      },
      context.fetcher,
    ),
);

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: centralStationCrmExecutorHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: readCentralStationCrmApiBaseUrl({
        apiBaseUrl: credential.metadata.apiBaseUrl ?? credential.values.account,
        subdomain: credential.metadata.subdomain ?? credential.values.account,
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return readCentralStationCrmApiBaseUrl({
      apiBaseUrl: credential.metadata.apiBaseUrl ?? credential.values.account,
      subdomain: credential.metadata.subdomain ?? credential.values.account,
    });
  },
  auth: { type: "api_key_header", name: "x-apikey" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCentralStationCrmCredential(
      {
        apiKey: input.apiKey,
        ...input.values,
      },
      fetcher,
      signal,
    );
  },
};
