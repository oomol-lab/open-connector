import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { LivespaceContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-proxy.ts";
import { providerFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import {
  buildLivespaceApiBaseUrl,
  createLivespaceContext,
  createLivespaceProxyBody,
  livespaceActionHandlers,
  validateLivespaceCredential,
} from "./runtime.ts";

const service = "livespace";

export const executors: ProviderExecutors = defineProviderExecutors<LivespaceContext>({
  service,
  handlers: livespaceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<LivespaceContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createLivespaceContext(credential.apiKey, credential.values, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = async (input, executionContext): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(executionContext, service);
    const context = createLivespaceContext(
      credential.apiKey,
      credential.values,
      providerFetch,
      executionContext.signal,
    );
    const url = createProviderProxyUrl(buildLivespaceApiBaseUrl(context.subdomain), input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    headers.set("user-agent", providerUserAgent);
    const response = await providerFetch(url, {
      method: input.method,
      headers,
      body: await createLivespaceProxyBody(input.body, context),
      signal: executionContext.signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `Livespace request failed with HTTP ${response.status}`),
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Livespace request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLivespaceCredential(input.apiKey, input.values, fetcher, signal);
  },
};
