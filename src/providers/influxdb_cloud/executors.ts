import type { ExecutionContext, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { InfluxdbCloudActionContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { influxdbCloudActionHandlers, resolveInfluxdbCloudApiBaseUrl } from "./runtime.ts";

const service = "influxdb_cloud";

export const executors: ProviderExecutors = defineProviderExecutors<InfluxdbCloudActionContext>({
  service,
  handlers: influxdbCloudActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<InfluxdbCloudActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveInfluxdbCloudApiBaseUrl(credential.metadata.apiBaseUrl ?? credential.values.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "InfluxDB Cloud request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveInfluxdbCloudApiBaseUrl(credential.metadata.apiBaseUrl ?? credential.values.apiBaseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Token " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});
