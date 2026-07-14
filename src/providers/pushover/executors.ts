import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord } from "../../core/cast.ts";
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
import { executors, pushoverVersionedApiBaseUrl, validatePushoverCredential } from "./runtime.ts";

export { executors };

const service = "pushover";
const pushoverFetch = createProviderFetch({ skipDnsValidation: true });

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePushoverCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(pushoverVersionedApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);

    const method = input.method.toUpperCase();
    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };

    if (method === "GET" || method === "HEAD") {
      setPushoverToken(url.searchParams, credential.apiKey);
    } else {
      init.body = createPushoverProxyBody(input.body, credential.apiKey, headers);
    }

    const response = await pushoverFetch(url, init);
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

function createPushoverProxyBody(body: unknown, token: string, headers: Headers): BodyInit {
  if (typeof body === "string") {
    const contentType = headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("application/x-www-form-urlencoded")) {
      return body;
    }
    const params = new URLSearchParams(body);
    setPushoverToken(params, token);
    headers.set("content-type", "application/x-www-form-urlencoded");
    return params;
  }

  const params = new URLSearchParams();
  const record = optionalRecord(body);
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      appendPushoverProxyParam(params, key, value);
    }
  }
  setPushoverToken(params, token);
  headers.set("content-type", "application/x-www-form-urlencoded");
  return params;
}

function appendPushoverProxyParam(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || typeof value === "object") {
    return;
  }
  params.set(key, String(value));
}

function setPushoverToken(params: URLSearchParams, token: string): void {
  if (!params.has("token")) {
    params.set("token", token);
  }
}
