import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { bestbuyActionHandlers, bestbuyApiOrigin, validateBestbuyCredential } from "./runtime.ts";

const service = "bestbuy";
const bestbuyFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bestbuyActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(bestbuyApiOrigin, input.endpoint, input.query);
    url.searchParams.set("apiKey", credential.apiKey);
    url.searchParams.set("format", "json");
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);

    const response = await bestbuyFetch(url, {
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
  apiKey(input, { fetcher, signal }) {
    return validateBestbuyCredential(input.apiKey, fetcher, signal);
  },
};
