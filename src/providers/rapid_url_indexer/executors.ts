import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import actions from "./actions.ts";
const baseUrl = "https://rapidurlindexer.com/wp-json/api/v1";
const defaultHeaders = { accept: "application/json", "user-agent": providerUserAgent };
async function request(
  endpoint: string,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
  body?: Record<string, unknown>,
) {
  return runProviderRequest({ signal: parentSignal, label: "Rapid URL Indexer" }, async (signal) => {
    const response = await fetcher(`${baseUrl}${endpoint}`, {
      method: body ? "POST" : "GET",
      headers: { ...defaultHeaders, "X-API-Key": apiKey, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Rapid URL Indexer returned non-JSON (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const error = optionalRecord(payload);
      const code = optionalString(error?.code);
      const message = optionalString(error?.message) ?? `Rapid URL Indexer request failed (HTTP ${response.status})`;
      const invalidKey = message === "Invalid API key" || message === "API key is missing";
      throw new ProviderRequestError(
        response.status,
        code ? `${code}: ${message}` : message,
        undefined,
        invalidKey ? "authorization_failed" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Rapid URL Indexer response");
  });
}
async function execute(
  actionName: string,
  valuesInput: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const data = valuesInput;
  const apiKey = context.apiKey;
  const fetcher = context.fetcher;
  switch (actionName) {
    case "create_project":
      return request("/projects", apiKey, fetcher, context.signal, data);
    case "list_projects":
      return request("/projects/list", apiKey, fetcher, context.signal);
    case "get_project":
      return request(`/projects/${data.project_id}`, apiKey, fetcher, context.signal);
    case "get_project_report":
      return request(`/projects/${data.project_id}/report`, apiKey, fetcher, context.signal);
    default:
      return request("/credits/balance", apiKey, fetcher, context.signal);
  }
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "rapid_url_indexer",
  Object.fromEntries(
    actions.map((action) => [
      action.name,
      (values: Record<string, unknown>, context: ApiKeyProviderContext) => execute(action.name, values, context),
    ]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await request("/credits/balance", input.apiKey, fetcher);
    return {
      profile: { displayName: "Rapid URL Indexer API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/credits/balance" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "rapid_url_indexer",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
