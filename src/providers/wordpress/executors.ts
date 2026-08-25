import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
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
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  buildWordpressAuthorization,
  createWordpressContext,
  validateWordpressCredential,
  validateWordpressOAuthCredential,
  wordpressActionHandlers,
} from "./runtime.ts";

const service = "wordpress";

const guardedProviderFetch = createProviderFetch({ allowPrivateNetwork: isPrivateNetworkAccessAllowed });

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: wordpressActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireWordpressCredential(context);
    return createWordpressContext(credential, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireWordpressCredential(context);
    const wordpressContext = createWordpressContext(credential, guardedProviderFetch, context.signal);
    const url = createProviderProxyUrl(wordpressContext.apiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", buildWordpressAuthorization(wordpressContext));
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
  oauth2(input, { fetcher, signal }) {
    return validateWordpressOAuthCredential(input, fetcher, signal);
  },
};

type WordpressCredential =
  | Extract<ResolvedCredential, { authType: "api_key" }>
  | Extract<ResolvedCredential, { authType: "oauth2" }>;

async function requireWordpressCredential(context: ExecutionContext): Promise<WordpressCredential> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "api_key" || credential?.authType === "oauth2") {
    return credential;
  }
  throw new ProviderRequestError(401, "Connect wordpress with OAuth or configure an application password first.");
}
