import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { tradebeeActions } from "./actions.ts";

const baseUrl = "https://platform.tradew.com/openapis";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };
const routes: Record<string, string> = {
  list_languages: "/languages",
  list_products: "/products/read",
  list_product_groups: "/productsgroup/read",
  list_blogs: "/blog/read",
  list_blog_groups: "/bloggroup/read",
};
interface TradebeeRequest {
  route: string;
  body: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ route, body, apiKey, fetcher, parentSignal }: TradebeeRequest) {
  return runProviderRequest({ signal: parentSignal, label: "Tradebee" }, async (signal) => {
    const response = await fetcher(`${baseUrl}${route}`, {
      method: "POST",
      signal,
      headers: { ...defaultHeaders, authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    const envelope = optionalRecord(payload);
    if (!response.ok || envelope?.status !== true) {
      const detail = optionalRawString(envelope?.msg) || `HTTP ${response.status}; invalid or unsuccessful response`;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Tradebee request failed: ${detail.split(apiKey).join("[REDACTED]")}`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return requiredResponseRecord(envelope.data, "Tradebee response data");
  });
}
const handlers = mapProviderActionHandlers(
  "tradebee",
  tradebeeActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route = routes[action.name];
    const body = dataInput;
    if (["list_products", "list_blogs", "list_blog_groups"].includes(action.name)) {
      const pagination = optionalRecord(body.pagination);
      body.pagination = {
        current_page: pagination?.current_page ?? 1,
        page_size: pagination?.page_size ?? 5,
      };
    }
    return request({
      route: route,
      body: body,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("tradebee", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request({
      route: "/languages",
      body: {},
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    return { profile: { displayName: "Tradebee API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "tradebee",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "content-type": "application/json" }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Provider request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
