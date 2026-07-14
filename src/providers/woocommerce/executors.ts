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
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  resolveWooCommerceCredentialContext,
  validateWooCommerceCredential,
  woocommerceActionHandlers,
} from "./runtime.ts";

const service = "woocommerce";

const proxyFetch = createProviderFetch({ allowPrivateNetwork: isPrivateNetworkAccessAllowed });

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: woocommerceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return resolveWooCommerceCredentialContext(credential.values, fetcher, context.signal, context.transitFiles);
  },
  fallbackMessage: "woocommerce request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const credentialContext = resolveWooCommerceCredentialContext(
      credential.values,
      proxyFetch,
      context.signal,
      context.transitFiles,
    );
    const url = createProviderProxyUrl(credentialContext.apiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      `Basic ${btoa(`${credentialContext.consumerKey}:${credentialContext.consumerSecret}`)}`,
    );
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

    const response = await proxyFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `woocommerce request failed with HTTP ${response.status}`,
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "woocommerce request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateWooCommerceCredential(input.values, guardedFetcher, signal);
  },
};
