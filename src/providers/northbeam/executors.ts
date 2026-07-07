import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { NorthbeamContext } from "./runtime.ts";

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
import {
  northbeamActionHandlers,
  northbeamApiBaseUrl,
  resolveNorthbeamCredentialContext,
  validateNorthbeamCredential,
} from "./runtime.ts";

const service = "northbeam";

export const executors: ProviderExecutors = defineProviderExecutors<NorthbeamContext>({
  service,
  handlers: northbeamActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NorthbeamContext> {
    const credential = await requireApiKeyCredential(context, service);
    return resolveNorthbeamCredentialContext(
      credential.apiKey,
      credential.values,
      credential.metadata,
      fetcher,
      context.signal,
    );
  },
  fallbackMessage: "northbeam request failed",
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const northbeamContext = resolveNorthbeamCredentialContext(
      credential.apiKey,
      credential.values,
      credential.metadata,
      fetch,
      context.signal,
    );
    const url = createProviderProxyUrl(northbeamApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", northbeamContext.apiKey);
    headers.set("data-client-id", northbeamContext.clientId);
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
      throw new ProviderRequestError(response.status, text || `Northbeam request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "northbeam request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNorthbeamCredential(input.apiKey, input.values, fetcher, signal);
  },
};
