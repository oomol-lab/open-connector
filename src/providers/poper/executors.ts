import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  providerFetch,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "poper";
const baseUrl = "https://api.poper.ai/general/v1";
const timeoutMs = 30_000;

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, {
  list_popups(_input, context) {
    return requestPoper("/popup/list", {}, context.apiKey, context.fetcher, context.signal);
  },
  list_popup_responses(input, context) {
    return requestPoper(
      "/popup/responses",
      { popup_id: requiredString(input.popup_id, "popup_id", providerInputError) },
      context.apiKey,
      context.fetcher,
      context.signal,
    );
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestPoper("/ping", {}, input.apiKey, fetcher, signal, true);
    const email = optionalString(payload.email);
    return {
      profile: { accountId: email ?? "poper:api-key", displayName: email ?? "Poper API Key" },
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/ping" },
    };
  },
};

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    if (input.method.toUpperCase() !== "POST")
      throw new ProviderRequestError(400, "Poper proxy only supports POST requests");
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    headers.set("user-agent", providerUserAgent);
    const form = new URLSearchParams(typeof input.body === "string" ? input.body : undefined);
    form.set("api_key", credential.apiKey);
    const body = typeof input.body === "string" ? undefined : optionalRecord(input.body);
    for (const [key, value] of Object.entries(body ?? {})) {
      if (value != null) form.set(key, String(value));
    }
    const response = await providerFetch(url, { method: "POST", headers, body: form, signal: context.signal });
    if (!response.ok) {
      const message = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, message || `Poper proxy returned HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Poper proxy request failed");
  }
};

async function requestPoper(
  path: string,
  form: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  validation = false,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(signal, timeoutMs);
  try {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": providerUserAgent,
      },
      body: new URLSearchParams({ api_key: apiKey, ...form }),
      signal: timeout.signal,
    });
    const text = await response.text();
    const payload = text ? parseJson(text) : undefined;
    if (!response.ok) throw mapError(response.status, payload, validation);
    const object = optionalRecord(payload);
    if (!object) throw new ProviderRequestError(502, "Poper returned an invalid JSON object");
    return object;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "Poper request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Poper request failed: ${error.message}` : "Poper request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function mapError(status: number, payload: unknown, validation: boolean): ProviderRequestError {
  const object = optionalRecord(payload);
  const message =
    optionalString(object?.message) ?? optionalString(object?.error) ?? `Poper request failed with status ${status}`;
  if (status === 401 || status === 403) return new ProviderRequestError(validation ? 400 : 401, message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status || 502, message);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
