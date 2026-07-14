import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  buildWordpressApiBaseUrl,
  createWordpressContext,
  validateWordpressCredential,
  wordpressActionHandlers,
} from "./runtime.ts";

const service = "wordpress";

const guardedProviderFetch = createProviderFetch({ allowPrivateNetwork: isPrivateNetworkAccessAllowed });

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: wordpressActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createWordpressContext(credential.apiKey, credential.values, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const wordpressContext = createWordpressContext(
      credential.apiKey,
      credential.values,
      guardedProviderFetch,
      context.signal,
    );
    const url = createProviderProxyUrl(buildWordpressApiBaseUrl(wordpressContext.siteUrl), input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${btoa(`${wordpressContext.username}:${wordpressContext.apiKey}`)}`);
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

    const response = await guardedProviderFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `WordPress request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "WordPress request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateWordpressCredential(input, guardedFetcher, signal);
  },
};
