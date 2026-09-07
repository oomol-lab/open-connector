import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { GrafanaCloudContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  grafanaCloudActionHandlers,
  grafanaCloudApiBaseUrl,
  requireGrafanaCloudOrgSlug,
  validateGrafanaCloudCredential,
} from "./runtime.ts";

const service = "grafana_cloud";

export const executors: ProviderExecutors = defineProviderExecutors<GrafanaCloudContext>({
  service,
  handlers: grafanaCloudActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GrafanaCloudContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      orgSlug: requireGrafanaCloudOrgSlug(
        optionalString(credential.values.orgSlug) ?? optionalString(credential.metadata.orgSlug),
      ),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "grafana_cloud request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: grafanaCloudApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateGrafanaCloudCredential(input.apiKey, input.values, fetcher, signal);
  },
};
