import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  docsbotAiActionHandlers,
  docsbotAiAdminBaseUrl,
  docsbotAiApiBaseUrl,
  validateDocsbotAiCredential,
} from "./runtime.ts";

const service = "docsbot_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, docsbotAiActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    // Reject an unusable credential before header normalization, keeping the 401/400 precedence.
    await requireApiKeyCredential(context, service);
    return docsbotAiAdminBaseUrl;
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedOrigins: [docsbotAiApiBaseUrl],
  customizeRequest({ endpoint, url }) {
    if (resolveDocsbotAiProxyBaseUrl(endpoint) === docsbotAiApiBaseUrl) {
      url.host = new URL(docsbotAiApiBaseUrl).host;
      url.pathname = url.pathname.slice(new URL(docsbotAiAdminBaseUrl).pathname.length);
    }
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDocsbotAiCredential(input.apiKey, fetcher, signal);
  },
};

function resolveDocsbotAiProxyBaseUrl(endpoint: string): string {
  return endpoint.endsWith("/search") || endpoint.endsWith("/fetch") ? docsbotAiApiBaseUrl : docsbotAiAdminBaseUrl;
}
