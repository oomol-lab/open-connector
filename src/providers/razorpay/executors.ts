import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

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
import { razorpayActionHandlers, razorpayApiBaseUrl, validateRazorpayCredential } from "./runtime.ts";

const service = "razorpay";
const razorpayFetch = createProviderFetch({ skipDnsValidation: true });

interface RazorpayExecutorContext {
  keyId: string;
  keySecret: string;
  fetcher: ProviderFetch;
}

export const executors: ProviderExecutors = defineProviderExecutors<RazorpayExecutorContext>({
  service,
  skipDnsValidation: true,
  handlers: razorpayActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<RazorpayExecutorContext> {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType !== "api_key") {
      throw new Error("razorpay requires api_key credential");
    }
    const keyId = credential.values.keyId?.trim();
    if (!keyId) {
      throw new Error("keyId is required");
    }
    return {
      keyId,
      keySecret: credential.apiKey,
      fetcher,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const keyId = credential.values.keyId?.trim();
    if (!keyId) {
      throw new ProviderRequestError(400, "keyId is required");
    }

    const url = createProviderProxyUrl(razorpayApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${btoa(`${keyId}:${credential.apiKey}`)}`);
    headers.set("user-agent", providerUserAgent);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }

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

    const response = await razorpayFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }

    return {
      ok: true,
      response: await readProviderProxyResponse(response),
    };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateRazorpayCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
