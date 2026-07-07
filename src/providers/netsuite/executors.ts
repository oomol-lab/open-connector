import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { NetsuiteContext } from "./runtime.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  buildOAuthAuthorizationHeader,
  netsuiteActionHandlers,
  resolveNetsuiteCredentialContext,
  validateNetsuiteCredential,
} from "./runtime.ts";

const service = "netsuite";

export const executors: ProviderExecutors = defineProviderExecutors<NetsuiteContext>({
  service,
  handlers: netsuiteActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NetsuiteContext> {
    const credential = await requireCustomCredential(context, service);
    return resolveNetsuiteCredentialContext(credential.values, credential.metadata, fetcher, context.signal);
  },
  fallbackMessage: "netsuite request failed",
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const netsuiteContext = resolveNetsuiteCredentialContext(
      credential.values,
      credential.metadata,
      fetch,
      context.signal,
    );
    const url = createProviderProxyUrl(netsuiteContext.restBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
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
    headers.set(
      "authorization",
      buildOAuthAuthorizationHeader({
        credential: netsuiteContext,
        method: input.method,
        url,
      }),
    );

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `NetSuite request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "netsuite request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateNetsuiteCredential(input.values, fetcher, signal);
  },
};
