import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { easyPeasyAiActions } from "./actions.ts";
const baseUrl = "https://easy-peasy.ai/api";

async function request(
  endpoint: string,
  apiKey: string,
  fetcher: typeof fetch,
  body?: Record<string, unknown>,
  validating = false,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Easy-Peasy.AI" }, async (signal) => {
    const response = await fetcher(`${baseUrl}${endpoint}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await readProviderTextBody(response, "easy_peasy_ai response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "Easy-Peasy.AI returned invalid JSON",
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const error = optionalRecord(payload)?.error;
      const message =
        optionalRawString(error) ??
        optionalRawString(optionalRecord(error)?.message) ??
        `Easy-Peasy.AI request failed with status ${response.status}`;
      if (response.status === 401 && message === "Invalid API key") {
        throw new ProviderRequestError(
          validating ? 400 : 401,
          message,
          undefined,
          validating ? "invalid_input" : "authorization_failed",
        );
      }
      throw new ProviderRequestError(
        response.status,
        message,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return payload;
  });
}

const handlers = mapProviderActionHandlers(
  "easy_peasy_ai",
  easyPeasyAiActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const apiKey = context.apiKey;
    const fetcher = context.fetcher;
    if (action.name === "generate_text") {
      const payload = await request(
        "/generate",
        apiKey,
        fetcher,
        {
          ...values,
          outputs: values.outputs ?? 1,
          language: values.language ?? "English",
          shouldUseGPT4: values.shouldUseGPT4 ?? false,
        },
        undefined,
        context.signal,
      );
      if (!Array.isArray(payload)) throw providerResponseError("Easy-Peasy.AI generated outputs must be an array");
      return { outputs: payload };
    }
    let endpoint = "/presets";
    if (action.name === "get_preset") {
      const slug = requiredInputString(values.slug, "slug");
      // Reject dot segments before URL normalization can change the endpoint.
      if (slug === "." || slug === "..") {
        throw new ProviderRequestError(400, "slug must identify a preset", undefined, "invalid_input");
      }
      endpoint += `/${encodeURIComponent(slug)}`;
    } else if (values.category !== undefined) {
      endpoint += `?${new URLSearchParams({ category: String(values.category) })}`;
    }
    return requiredResponseRecord(
      await request(endpoint, apiKey, fetcher, undefined, undefined, context.signal),
      "Easy-Peasy.AI preset response",
    );
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("easy_peasy_ai", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const payload = requiredResponseRecord(
      await request("/presets", requiredInputString(input.apiKey, "API Key"), fetcher, undefined, true),
      "Easy-Peasy.AI presets",
    );
    if (!Array.isArray(payload.presets)) throw providerResponseError("Easy-Peasy.AI presets must be an array");
    return {
      profile: { displayName: "Easy-Peasy.AI API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "easy_peasy_ai",
  baseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
