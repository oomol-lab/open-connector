import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  defineApiKeyProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { tushareActionHandlers, tushareApiBaseUrl, validateTushareCredential } from "./runtime.ts";

const service = "tushare";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tushareActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    if (endpoint !== "/") {
      throw new ProviderRequestError(400, "tushare proxy endpoint must be /");
    }

    const credential = await requireApiKeyCredential(context, service);
    const body = readProxyBody(input.body);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);

    const response = await fetch(new URL(tushareApiBaseUrl), {
      method: input.method,
      headers,
      body: JSON.stringify({ ...body, token: credential.apiKey }),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Tushare request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Tushare request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTushareCredential(input.apiKey, fetcher, signal);
  },
};

function readProxyBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  throw new ProviderRequestError(400, "tushare proxy body must be a JSON object");
}
