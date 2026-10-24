import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import {
  buildSpeedtestTrackerProxyBaseUrl,
  createSpeedtestTrackerContext,
  normalizeSpeedtestTrackerBaseUrl,
  speedtestTrackerActionHandlers,
  validateSpeedtestTrackerCredential,
} from "./runtime.ts";

const service = "speedtest_tracker";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: speedtestTrackerActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.metadata.baseUrl) ?? optionalString(credential.values.baseUrl);
    if (!baseUrl) throw new ProviderRequestError(500, "speedtest_tracker connection is missing baseUrl metadata");
    return createSpeedtestTrackerContext(
      credential.apiKey,
      normalizeSpeedtestTrackerBaseUrl(baseUrl),
      fetcher,
      context.signal,
    );
  },
  fallbackMessage: "Speedtest Tracker request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    const value = optionalString(credential.metadata.baseUrl) ?? optionalString(credential.values.baseUrl);
    if (!value) throw new ProviderRequestError(500, "speedtest_tracker connection is missing baseUrl metadata");
    return buildSpeedtestTrackerProxyBaseUrl(normalizeSpeedtestTrackerBaseUrl(value));
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateSpeedtestTrackerCredential(input.values, input.apiKey, guardedFetcher, signal);
  },
};
