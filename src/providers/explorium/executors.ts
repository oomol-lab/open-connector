import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  ProviderRequestError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { exploriumActions } from "./actions.ts";
const baseUrl = "https://api.explorium.ai/v1";
const endpoints: Record<string, string> = {
  match_businesses: "/businesses/match",
  enrich_firmographics: "/businesses/firmographics/bulk_enrich",
  enrich_technographics: "/businesses/technographics/bulk_enrich",
  autocomplete_businesses: "/businesses/autocomplete",
};
function requireAutocompleteItems(payload: unknown): unknown[] {
  if (!Array.isArray(payload)) {
    throw providerResponseError("Explorium autocomplete response is not an array");
  }
  return payload;
}
interface ExploriumRequest extends ApiKeyProviderContext {
  endpoint: string;
  values: Record<string, unknown>;
  autocomplete: boolean;
}
async function request({ endpoint, values, apiKey, fetcher, autocomplete, signal: parentSignal }: ExploriumRequest) {
  return runProviderRequest({ label: "Explorium", signal: parentSignal }, async (signal) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    if (autocomplete) {
      url.searchParams.set("field", optionalRawString(values.field)!);
      if (values.query !== undefined) url.searchParams.set("query", optionalRawString(values.query)!);
    }
    const response = await fetcher(url, {
      method: autocomplete ? "GET" : "POST",
      headers: { accept: "application/json", "content-type": "application/json", api_key: apiKey },
      body: autocomplete ? undefined : JSON.stringify(values),
      signal,
    });
    const text = await response.text();
    let payload: unknown = undefined;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const record = optionalRecord(payload);
      const detail = Array.isArray(record?.detail)
        ? record.detail
            .map((item) => optionalRawString(optionalRecord(item)?.msg))
            .filter(Boolean)
            .join("; ")
        : optionalRawString(record?.detail);
      const message =
        detail ||
        optionalRawString(record?.message) ||
        optionalRawString(record?.error) ||
        optionalRawString(payload) ||
        (payload === undefined ? text : "");
      const code = optionalRawString(record?.code);
      throw new ProviderRequestError(
        response.status,
        `${code ? `${code}: ` : ""}${message.trim() || `Explorium request failed with status ${response.status}`}`.replaceAll(
          apiKey,
          "[REDACTED]",
        ),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (payload === undefined) throw providerResponseError("Explorium response is not valid JSON");
    return payload;
  });
}
const handlers = mapProviderActionHandlers(
  "explorium",
  exploriumActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const autocomplete = action.name === "autocomplete_businesses";
    const payload = await request({ ...context, endpoint: endpoints[action.name]!, values, autocomplete });
    return autocomplete
      ? { items: requireAutocompleteItems(payload) }
      : requiredResponseRecord(payload, "Explorium response");
  },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request({
      endpoint: "/businesses/autocomplete",
      values: { field: "country", query: "unit" },
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher,
      autocomplete: true,
      signal,
    });
    requireAutocompleteItems(payload);
    return {
      profile: { displayName: "Explorium API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/businesses/autocomplete" },
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("explorium", handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "explorium",
  baseUrl,
  auth: { type: "api_key_header", name: "api_key" },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, `Provider request failed with HTTP ${response.status}`),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
