import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import {
  createProviderProxyUrl,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { executors, qianfanApiBaseUrl, qianfanApiOrigin, validateQianfanCredential } from "./runtime.ts";

export { executors };

const service = "qianfan";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateQianfanCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(qianfanProxyBaseUrl(endpoint), endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${credential.apiKey}`);
    headers.set("user-agent", providerUserAgent);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }

    return {
      ok: true,
      response: await readProviderProxyResponse(response),
    };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

function qianfanProxyBaseUrl(endpoint: string): string {
  if (endpoint === "/v2" || endpoint.startsWith("/v2/") || endpoint.startsWith("/video/generations")) {
    return qianfanApiOrigin;
  }
  return qianfanApiBaseUrl;
}
