import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import { requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { defineSendsparkExecutors, sendsparkApiBaseUrl, validateSendsparkCredential } from "./runtime.ts";

const service = "sendspark";
const sendsparkFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineSendsparkExecutors();

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const userApiSecret = requiredString(
      credential.values.userApiSecret,
      "userApiSecret",
      (message) => new ProviderRequestError(400, message),
    );
    const url = createProviderProxyUrl(sendsparkApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    headers.set("user-agent", providerUserAgent);
    headers.set("x-api-key", credential.apiKey);
    headers.set("x-api-secret", userApiSecret);

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

    const response = await sendsparkFetch(url, init);
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
    return validateSendsparkCredential(input, fetcher, signal);
  },
};
