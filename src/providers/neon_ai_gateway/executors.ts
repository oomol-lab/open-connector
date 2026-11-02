import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { NeonAiGatewayContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  createNeonAiGatewayContext,
  neonAiGatewayActionHandlers,
  normalizeNeonAiGatewayBaseUrl,
  validateNeonAiGatewayCredential,
} from "./runtime.ts";

const service = "neon_ai_gateway";

export const executors: ProviderExecutors = defineProviderExecutors<NeonAiGatewayContext>({
  service,
  handlers: neonAiGatewayActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NeonAiGatewayContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createNeonAiGatewayContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const value = optionalString(credential.metadata.apiBaseUrl) ?? optionalString(credential.values.baseUrl);
    if (!value) throw new ProviderRequestError(500, "neon_ai_gateway connection is missing baseUrl metadata");
    return normalizeNeonAiGatewayBaseUrl(value);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateNeonAiGatewayCredential(input.values, input.apiKey, fetcher, signal);
  },
};
