import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  isAbortLikeError,
} from "../provider-runtime.ts";
import { finlightActions } from "./actions.ts";
const baseUrl = "https://api.finlight.me/v2";
function requireSources(value: unknown) {
  if (!Array.isArray(value))
    throw new ProviderRequestError(502, "Finlight returned an invalid sources list", undefined, "provider_error");
  return value;
}
function errorMessage(value: unknown): string | undefined {
  const message = optionalRawString(value);
  if (message) return message;
  if (Array.isArray(value)) return value.map(errorMessage).filter(Boolean).join("; ") || undefined;
  const object = optionalRecord(value);
  if (!object) return undefined;
  const constraints = optionalRecord(object.constraints);
  if (constraints) return errorMessage(Object.values(constraints));
  return errorMessage(Object.values(object));
}
async function request(
  route: string,
  apiKey: string,
  fetcher: typeof fetch,
  body?: string,
  validating = false,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Finlight" }, async (signal) => {
    const response = await fetcher(`${baseUrl}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body,
      signal,
    });
    let payload: unknown;
    try {
      payload = await JSON.parse(await readProviderTextBody(response, "finlight response", undefined, signal));
    } catch (error) {
      if (error instanceof ProviderRequestError || isAbortLikeError(error)) throw error;
      if (response.ok)
        throw new ProviderRequestError(502, "Finlight returned invalid JSON", undefined, "provider_error");
    }
    if (!response.ok) {
      const result = optionalRecord(payload);
      const message = (
        errorMessage(result?.message) ||
        errorMessage(result?.errors) ||
        optionalRawString(result?.error) ||
        `Finlight request failed with HTTP ${response.status}`
      ).replaceAll(apiKey, "[REDACTED]");
      const invalidKey = response.status === 401 && result?.statusCode === 401 && result.message === "Unauthorized";
      throw new ProviderRequestError(
        invalidKey && validating ? 400 : response.status,
        message,
        undefined,
        invalidKey
          ? validating
            ? "invalid_input"
            : "authorization_failed"
          : response.status === 429
            ? "rate_limited"
            : "provider_error",
      );
    }
    return payload;
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "finlight",
  mapProviderActionHandlers(
    "finlight",
    finlightActions,
    (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const apiKey = context.apiKey;
      const fetcher = context.fetcher;
      if (action.name === "list_sources") {
        return {
          sources: requireSources(await request("/sources", apiKey, fetcher, undefined, undefined, context.signal)),
        };
      }
      let result: unknown;
      if (action.name === "search_articles") {
        result = await request("/articles", apiKey, fetcher, JSON.stringify(input), undefined, context.signal);
      } else {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(input)) {
          if (value !== undefined) query.set(key, String(value));
        }
        result = await request(`/articles/by-link?${query}`, apiKey, fetcher, undefined, undefined, context.signal);
      }
      const envelope = requiredResponseRecord(result, "Finlight response");
      if (action.name === "search_articles") {
        if (!Array.isArray(envelope.articles))
          throw new ProviderRequestError(502, "Finlight response is missing articles", undefined, "provider_error");
      } else {
        requiredResponseRecord(envelope.article, "Finlight article");
      }
      return envelope;
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await request("/sources", requiredInputString(input.apiKey, "API Key"), fetcher, undefined, true);
    requireSources(result);
    return {
      profile: { displayName: "Finlight API Key" },
      grantedScopes: [],
      metadata: { validationEndpoint: "/v2/sources" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "finlight",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
