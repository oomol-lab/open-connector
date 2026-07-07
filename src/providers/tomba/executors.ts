import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { tombaActionHandlers, tombaApiBaseUrl, validateTombaCredential } from "./runtime.ts";

const service = "tomba";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: tombaActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    const apiSecret = credential.values.apiSecret || credential.values.secret;
    if (!apiSecret) {
      throw new ProviderRequestError(401, "Configure Tomba API secret first.");
    }
    return {
      credential: {
        apiKey: credential.apiKey,
        apiSecret,
      },
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const apiSecret = credential.values.apiSecret || credential.values.secret;
    if (!apiSecret) {
      throw new ProviderRequestError(401, "Configure Tomba API secret first.");
    }

    const url = createProviderProxyUrl(tombaApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("x-tomba-key", credential.apiKey);
    headers.set("x-tomba-secret", apiSecret);
    headers.set("user-agent", providerUserAgent);

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
      throw new ProviderRequestError(response.status, text || `Tomba request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Tomba request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTombaCredential(
      {
        apiKey: input.apiKey,
        apiSecret: input.values.apiSecret || input.values.secret,
      },
      fetcher,
      signal,
    );
  },
};
