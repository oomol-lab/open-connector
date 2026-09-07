import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { RailwayActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  createRailwayContext,
  railwayActionHandlers,
  railwayApiBaseUrl,
  validateRailwayCredential,
} from "./runtime.ts";

const service = "railway";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: railwayApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineProviderExecutors<RailwayActionContext>({
  service,
  handlers: railwayActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<RailwayActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createRailwayContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  fallbackMessage: "Railway request failed",
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateRailwayCredential(input.apiKey, input.values, fetcher, signal);
  },
};
