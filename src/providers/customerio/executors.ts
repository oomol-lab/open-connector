import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { CustomerioCredentialContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  customerioActionHandlers,
  resolveCustomerioCredentialContext,
  validateCustomerioCredential,
} from "./runtime.ts";

const service = "customerio";

export const executors: ProviderExecutors = defineProviderExecutors<CustomerioCredentialContext>({
  service,
  handlers: customerioActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CustomerioCredentialContext> {
    const credential = await requireCustomCredential(context, service);
    return resolveCustomerioCredentialContext(credential.values, fetcher, context.signal, credential.metadata);
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireCustomCredential(context, service);
    const customerioContext = resolveCustomerioCredentialContext(
      credential.values,
      providerFetch,
      context.signal,
      credential.metadata,
    );
    const url = createProviderProxyUrl(customerioContext.apiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${customerioContext.siteId}:${customerioContext.apiKey}`).toString("base64")}`,
    );
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await providerFetch(url, {
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
  customCredential(input, { fetcher, signal }) {
    return validateCustomerioCredential(input.values, fetcher, signal);
  },
};
