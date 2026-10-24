import type { TransitFileWriter } from "../../core/types.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { TinyfishEndpoint } from "./endpoints.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { storeResponseInTransit } from "../../core/request.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { tinyfishActions } from "./actions.ts";
import { tinyfishEndpointByName } from "./actions.ts";
const origins = {
  main: "https://agent.tinyfish.ai",
  search: "https://api.search.tinyfish.ai",
  fetchApi: "https://api.fetch.tinyfish.ai",
  browser: "https://api.browser.tinyfish.ai",
};
async function request(
  endpoint: TinyfishEndpoint,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  validating = false,
  transitFiles?: TransitFileWriter,
  parentSignal?: AbortSignal,
) {
  const body = { ...input };
  let path = endpoint.path;
  for (const key of endpoint.pathKeys ?? []) {
    const value = String(body[key]);
    if (value === "." || value === "..") throw providerInputError(`Invalid ${key}`);
    path = path.replace(`{${key}}`, encodeURIComponent(value));
    delete body[key];
  }
  const url = new URL(path, origins[endpoint.origin]);
  for (const key of endpoint.queryKeys ?? []) {
    const value = body[key];
    if (endpoint.name === "search" && key === "fetch" && JSON.stringify(value)?.length > 256)
      throw providerInputError("Search fetch configuration must encode to at most 256 characters");
    if (value !== undefined && value !== null)
      url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    delete body[key];
  }
  const headers = new Headers({
    "X-API-Key": apiKey,
    accept:
      endpoint.responseType === "screenshot"
        ? "image/jpeg"
        : endpoint.responseType === "html"
          ? "text/html"
          : "application/json",
  });
  if (endpoint.name === "top_up_wallet") {
    const amount = Number(body.amount);
    if (amount < 10 || amount > 500) throw providerInputError("Wallet top-up amount must be between 10 and 500 USD");
    const paymentAuthorization = optionalString(body.paymentAuthorization);
    if (paymentAuthorization) headers.set("Payment-Authorization", paymentAuthorization);
    delete body.paymentAuthorization;
  }
  const hasBody = endpoint.method === "POST" || endpoint.method === "PATCH";
  if (hasBody) headers.set("content-type", "application/json");
  if (endpoint.responseType && !transitFiles)
    throw new ProviderRequestError(
      500,
      "TinyFish snapshots require file transit and execution context",
      undefined,
      "provider_error",
    );
  const timeoutMs = endpoint.origin === "fetchApi" && endpoint.method === "POST" ? 150000 : undefined;
  return runProviderRequest({ label: "TinyFish", timeoutMs, signal: parentSignal }, async (signal) => {
    const response = await fetcher(url, {
      method: endpoint.method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal,
    });
    if (response.ok && endpoint.responseType) {
      const mimeType = endpoint.responseType === "screenshot" ? "image/jpeg" : "text/html";
      const file = await storeResponseInTransit(response, transitFiles!, {
        name: endpoint.responseType === "screenshot" ? "tinyfish-screenshot.jpg" : "tinyfish-snapshot.html",
        mimeType,
        fieldName: "TinyFish snapshot",
        createError: providerResponseError,
        signal,
      });
      return { url: file.downloadUrl, mimeType };
    }
    if (response.status === 204 && response.ok) return { success: true };
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (endpoint.name === "top_up_wallet" && response.status === 402 && response.headers.has("www-authenticate")) {
      return {
        status: "payment_required",
        challenge: response.headers.get("www-authenticate"),
        body: payload ?? null,
      };
    }
    if (!response.ok) {
      const object = optionalRecord(payload);
      const error = optionalRecord(object?.error);
      const code = optionalString(error?.code);
      const message =
        optionalString(error?.message) ??
        optionalString(object?.message) ??
        optionalString(object?.detail) ??
        optionalString(object?.title);
      const hint = optionalString(object?.hint) ?? optionalString(error?.hint);
      const invalidKey = code === "INVALID_API_KEY" || code === "MISSING_API_KEY";
      throw new ProviderRequestError(
        invalidKey && validating ? 400 : response.status,
        `TinyFish request failed (${response.status})${code ? `: ${code}` : ""}${message ? `: ${message}` : ""}${hint ? `: ${hint}` : ""}`,
        undefined,
        invalidKey ? (validating ? "invalid_input" : "authorization_failed") : "provider_error",
      );
    }
    const result = requiredResponseRecord(payload, "TinyFish response");
    const taskIdFields: Record<string, string> = { submit_run: "run_id", start_research: "research_run_id" };
    const taskIdField = taskIdFields[endpoint.name];
    if (taskIdField && !optionalString(result[taskIdField]))
      throw providerResponseError("TinyFish task creation failed: missing task ID");
    if (endpoint.name === "submit_run_batch" && !Array.isArray(result.run_ids)) {
      const error = optionalRecord(result.error);
      throw providerResponseError(
        `TinyFish batch creation failed: ${optionalString(error?.message) ?? "missing run IDs"}`,
      );
    }
    return result;
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const endpoint = tinyfishEndpointByName.get(actionName);
  if (!endpoint) throw providerInputError("Unknown TinyFish action");
  return request(endpoint, values, apiKey, fetcher, false, context.transitFiles, context.signal);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const endpoint = [...tinyfishEndpointByName.values()].find(
      (entry) => entry.origin === "search" && entry.path === "/usage",
    )!;
    await request(endpoint, { limit: 1 }, input.apiKey, fetcher, true, undefined, signal);
    return { profile: { displayName: "TinyFish API Key" }, grantedScopes: [], metadata: {} };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "tinyfish",
  Object.fromEntries(
    tinyfishActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "tinyfish",
  baseUrl: origins.main,
  allowedOrigins: Object.values(origins),
  auth: { type: "api_key_header", name: "X-API-Key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
