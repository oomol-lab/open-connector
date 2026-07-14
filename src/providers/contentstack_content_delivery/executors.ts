import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
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
import { contentstackContentDeliveryActionHandlers, validateContentstackContentDeliveryCredential } from "./runtime.ts";

const service = "contentstack_content_delivery";
const contentstackContentDeliveryApiBaseUrl = "https://cdn.contentstack.io/v3";
const contentstackContentDeliveryFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: contentstackContentDeliveryActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      stackApiKey: credential.apiKey,
      deliveryToken: credential.values.deliveryToken,
      branch: credential.values.branch || credential.metadata.branch,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const deliveryToken = optionalString(credential.values.deliveryToken);
    if (!deliveryToken) {
      throw new ProviderRequestError(400, "Contentstack Delivery Token is required");
    }
    const url = createProviderProxyUrl(contentstackContentDeliveryApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    const branch = optionalString(credential.values.branch) ?? optionalString(credential.metadata.branch);
    headers.set("api_key", credential.apiKey);
    headers.set("access_token", deliveryToken);
    headers.set("user-agent", providerUserAgent);
    if (branch) {
      headers.set("branch", branch);
    }
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await contentstackContentDeliveryFetch(url, {
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
  async apiKey(input, { fetcher, signal }) {
    return validateContentstackContentDeliveryCredential(
      {
        apiKey: input.apiKey,
        ...input.values,
      },
      fetcher,
      signal,
    );
  },
};
