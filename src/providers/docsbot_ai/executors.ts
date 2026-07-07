import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import {
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  docsbotAiActionHandlers,
  docsbotAiAdminBaseUrl,
  docsbotAiApiBaseUrl,
  validateDocsbotAiCredential,
} from "./runtime.ts";

const service = "docsbot_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, docsbotAiActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const url = createProviderProxyUrl(resolveDocsbotAiProxyBaseUrl(endpoint), endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${credential.apiKey}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDocsbotAiCredential(input.apiKey, fetcher, signal);
  },
};

function resolveDocsbotAiProxyBaseUrl(endpoint: string): string {
  return endpoint.endsWith("/search") || endpoint.endsWith("/fetch") ? docsbotAiApiBaseUrl : docsbotAiAdminBaseUrl;
}
