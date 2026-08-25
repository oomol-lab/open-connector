import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const baseUrl = "https://openapi.gateway.chuhaijiang.com";
type Context = Parameters<Parameters<typeof defineApiKeyProviderExecutors>[1][string]>[1];
async function request(
  path: string,
  query: Record<string, unknown>,
  context: Context,
): Promise<Record<string, unknown>> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "X-API-Key": context.apiKey, "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ProviderRequestError(response.status || 502, "Chuhaijiang request failed", payload);
  return payload as Record<string, unknown>;
}
function sort(input: Record<string, unknown>): string | undefined {
  if (input.sort_direction !== undefined && input.sort_field === undefined)
    throw new ProviderRequestError(400, "sort_field is required with sort_direction");
  return input.sort_field === undefined
    ? undefined
    : `${String(input.sort_field)}:${String(input.sort_direction ?? "desc")}`;
}
function normalize(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data || !Array.isArray(data.items))
    throw new ProviderRequestError(502, "Chuhaijiang returned an invalid list payload", payload);
  const usage = payload.usage as Record<string, unknown> | undefined;
  return {
    items: data.items,
    totalCount: data.total_count,
    requestId: payload.request_id,
    ...(usage ? { usage: { creditsCost: usage.credits_cost, creditsBalance: usage.credits_balance } } : {}),
  };
}
function listRelated(
  resource: string,
  input: Record<string, unknown>,
  context: Context,
): Promise<Record<string, unknown>> {
  return request(
    `/open/v1/products/${encodeURIComponent(String(input.product_id))}/${resource}`,
    { country: input.country, page: input.page, page_size: input.page_size },
    context,
  ).then(normalize);
}
function listRanking(
  ranking: string,
  input: Record<string, unknown>,
  context: Context,
): Promise<Record<string, unknown>> {
  return request(
    `/open/v1/products/rankings/${ranking}`,
    { ...input, sort: sort(input), sort_field: undefined, sort_direction: undefined },
    context,
  ).then(normalize);
}
const handlers: ProviderActionHandlers<"chuhaijiang", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async search_products(input, context) {
    return normalize(
      await request(
        "/open/v1/products/search",
        { ...input, sort: sort(input), sort_field: undefined, sort_direction: undefined },
        context,
      ),
    );
  },
  async get_product(input, context) {
    const payload = normalize(
      await request(
        `/open/v1/products/${encodeURIComponent(String(input.product_id))}`,
        { country: input.country, include: Array.isArray(input.include) ? input.include.join(",") : undefined },
        context,
      ),
    );
    const items = payload.items as unknown[];
    if (!items[0]) throw new ProviderRequestError(502, "Chuhaijiang product response omitted product");
    return { product: items[0], requestId: payload.requestId, ...(payload.usage ? { usage: payload.usage } : {}) };
  },
  list_product_creators: (input, context) => listRelated("creators", input, context),
  list_product_videos: (input, context) => listRelated("videos", input, context),
  list_product_lives: (input, context) => listRelated("lives", input, context),
  list_product_reviews: (input, context) => listRelated("reviews", input, context),
  list_similar_products: (input, context) => listRelated("similar", input, context),
  list_top_selling_products: (input, context) => listRanking("top-selling", input, context),
  list_most_promoted_products: (input, context) => listRanking("most-promoted", input, context),
  list_new_arrival_products: (input, context) => listRanking("new-arrivals", input, context),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("chuhaijiang", handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "chuhaijiang",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    let response: Response;
    try {
      response = await fetcher(new URL("/open/v1/auth/verify", baseUrl), {
        headers: { accept: "application/json", "X-API-Key": input.apiKey, "user-agent": providerUserAgent },
        signal,
      });
    } catch (error) {
      throw new ProviderRequestError(
        502,
        error instanceof Error ? `Chuhaijiang request failed: ${error.message}` : "Chuhaijiang request failed",
      );
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : 400,
        "Chuhaijiang credential validation failed",
        payload,
      );
    const root = optionalRecord(payload);
    const data = optionalRecord(root?.data);
    const appId = optionalInteger(data?.app_id);
    const tier = optionalString(data?.tier);
    const creditsBalance = optionalInteger(data?.credits_balance);
    const status = optionalString(data?.status);
    if (appId === undefined || !tier || creditsBalance === undefined || !status) {
      throw new ProviderRequestError(502, "Chuhaijiang returned an invalid account payload", payload);
    }
    if (status !== "active") throw new ProviderRequestError(400, `Chuhaijiang API key account is ${status}`);
    return {
      profile: { accountId: String(appId), displayName: "Chuhaijiang API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: baseUrl,
        validationEndpoint: "/open/v1/auth/verify",
        appId,
        tier,
        creditsBalance,
        status,
      },
    };
  },
};
