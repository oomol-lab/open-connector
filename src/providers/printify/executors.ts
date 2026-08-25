import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "printify";
const baseUrl = "https://api.printify.com/v1/";

async function request(path: string, query: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", authorization: `Bearer ${context.apiKey}`, "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "Printify returned invalid JSON");
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      optionalString(optionalRecord(payload)?.message) ?? `Printify request failed with HTTP ${response.status}`,
      payload,
    );
  return payload;
}

function positive(value: unknown, field: string): number {
  const number = optionalInteger(value);
  if (number == null) throw new ProviderRequestError(400, `${field} must be an integer`);
  if (number < 1) throw new ProviderRequestError(400, `${field} must be positive`);
  return number;
}

function page(payload: unknown, key: string): unknown {
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.data)) {
    throw new ProviderRequestError(502, "Printify returned an invalid paginated response");
  }
  return {
    [key]: record.data,
    currentPage: pageNumber(record.current_page, "current_page", 1),
    lastPage: pageNumber(record.last_page, "last_page", 1),
    total: pageNumber(record.total, "total", 0),
  };
}

function pageNumber(value: unknown, field: string, minimum: number): number {
  const number = optionalInteger(value);
  if (number === undefined || number < minimum) {
    throw new ProviderRequestError(502, `Printify returned an invalid ${field}`);
  }
  return number;
}

const handlers: ProviderActionHandlers<"printify", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_shops(_input, context) {
    const payload = await request("shops.json", {}, context);
    return { shops: Array.isArray(payload) ? payload : [] };
  },
  async list_products(input, context) {
    return page(
      await request(
        `shops/${positive(input.shopId, "shopId")}/products.json`,
        { page: input.page, limit: input.limit },
        context,
      ),
      "products",
    );
  },
  async get_product(input, context) {
    return {
      product: await request(
        `shops/${positive(input.shopId, "shopId")}/products/${encodeURIComponent(requiredString(input.productId, "productId"))}.json`,
        {},
        context,
      ),
    };
  },
  async list_orders(input, context) {
    return page(
      await request(
        `shops/${positive(input.shopId, "shopId")}/orders.json`,
        { page: input.page, limit: input.limit, status: input.status, sku: input.sku },
        context,
      ),
      "orders",
    );
  },
  async get_order(input, context) {
    return {
      order: await request(
        `shops/${positive(input.shopId, "shopId")}/orders/${encodeURIComponent(requiredString(input.orderId, "orderId"))}.json`,
        {},
        context,
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request("shops.json", {}, { apiKey: input.apiKey, fetcher, signal });
    const shops = Array.isArray(payload) ? payload : [];
    const first = optionalRecord(shops[0]);
    return {
      profile: { displayName: optionalString(first?.title)?.trim() || "Printify Merchant" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, shopCount: shops.length },
    };
  },
};
