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
  isAbortLikeError,
  ProviderRequestError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { snappyActions } from "./actions.ts";
const baseUrl = "https://api.snappy.com/public-api";
const defaultHeaders = { accept: "application/json" };
const endpoints: Record<string, string> = {
  list_accounts: "/v3/accounts",
  list_collections: "/v3/collections",
  get_collection: "/v3/collections/{collectionId}",
  list_collection_products: "/v3/collections/{collectionId}/products",
  list_products: "/v3/products",
  get_product: "/v3/products/{productId}",
  list_product_variants: "/v3/products/{productId}/variants",
  get_variant: "/v3/variants/{variantId}",
  get_variant_availability: "/v3/variants/{variantId}/availability",
  list_product_tags: "/v3/product-tags",
};
async function request(
  path: string,
  values: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const url = new URL(baseUrl + path);
  const headers = new Headers(defaultHeaders);
  headers.set("X-Api-Key", apiKey);
  for (const [key, value] of Object.entries(values)) {
    if (value == null) continue;
    if (key === "accountId") headers.set("Snappy-Account-Id", String(value));
    else url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return runProviderRequest({ label: "Snappy", signal: parentSignal }, async (signal) => {
    const response = await fetcher(url, { headers, signal });
    let payload: unknown = undefined;
    try {
      payload = await response.json();
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "Snappy returned a non-JSON response",
        undefined,
        "provider_error",
      );
    }
    const record = requiredResponseRecord(payload, "Snappy response");
    if (!response.ok) {
      const code = optionalRawString(record.errorCode);
      const message = optionalRawString(record.message) ?? "Snappy request failed";
      throw new ProviderRequestError(
        response.status,
        code ? `${code}: ${message}` : message,
        undefined,
        "provider_error",
      );
    }
    return record;
  });
}
const handlers = mapProviderActionHandlers(
  "snappy",
  snappyActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const { productId, collectionId, variantId, ...parameters } = values;
    let path = endpoints[action.name]!;
    for (const [key, value] of Object.entries({ productId, collectionId, variantId })) {
      if (value != null) {
        path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
      }
    }
    return request(path, parameters, context.apiKey, context.fetcher, context.signal);
  },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request(
      "/v3/accounts",
      { "page[size]": 2 },
      requiredInputString(input.apiKey, "API Key"),
      fetcher,
      signal,
    );
    if (!Array.isArray(payload.data)) throw providerResponseError("Snappy accounts response is missing data");
    const links = optionalRecord(payload.links);
    const account = payload.data.length === 1 && links?.next === null ? optionalRecord(payload.data[0]) : undefined;
    return {
      profile: { displayName: optionalRawString(account?.name) ?? "Snappy Account" },
      grantedScopes: [],
      metadata: { validationEndpoint: "/v3/accounts" },
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("snappy", handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "snappy",
  baseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
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
