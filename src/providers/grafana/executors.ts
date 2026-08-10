import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { GrafanaContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { grafanaActionHandlers, normalizeGrafanaBaseUrl, validateGrafanaCredential } from "./runtime.ts";

const service = "grafana";

export const executors: ProviderExecutors = defineProviderExecutors<GrafanaContext>({
  service,
  handlers: grafanaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GrafanaContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      baseUrl: normalizeGrafanaBaseUrl(
        optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
      ),
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "grafana request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeGrafanaBaseUrl(
      optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
    );
  },
  auth: { type: "bearer" },
  allowedEndpoint: (endpoint) => endpoint === "/api" || endpoint.startsWith("/api/"),
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateGrafanaCredential(input.apiKey, input.values, guardedFetcher, signal);
  },
};
