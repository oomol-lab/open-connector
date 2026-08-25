import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ExecutionContext } from "../../core/types.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "ozon";
const baseUrl = "https://api-seller.ozon.ru";
const paths: Record<string, string> = {
  get_seller_info: "/v1/seller/info",
  list_products: "/v3/product/list",
  get_product_info: "/v3/product/info/list",
  list_product_prices: "/v5/product/info/prices",
  list_product_stocks: "/v4/product/info/stocks",
  list_fbs_postings: "/v4/posting/fbs/list",
  get_fbs_posting: "/v3/posting/fbs/get",
};
interface Context {
  apiKey: string;
  clientId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const handlers = Object.fromEntries(
  Object.entries(paths).map(([name, path]) => [
    name,
    async (input: Record<string, unknown>, context: Context) => {
      if (name === "get_product_info") validateIdentifierCount(input);
      return requestOzon(path, input, context, "execute");
    },
  ]),
);

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher) {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential")
      throw new ProviderRequestError(400, "ozon requires custom_credential");
    return {
      apiKey: requiredString(credential.values.apiKey, "apiKey"),
      clientId: requiredString(credential.values.clientId, "clientId"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const context: Context = {
      apiKey: requiredString(input.values.apiKey, "apiKey"),
      clientId: requiredString(input.values.clientId, "clientId"),
      fetcher,
      signal,
    };
    const payload = optionalRecord(await requestOzon("/v1/seller/info", {}, context, "validate"));
    const company = optionalRecord(payload?.company);
    return {
      profile: {
        accountId: `ozon:${context.clientId}`,
        displayName: optionalString(company?.name) || "Ozon Seller",
      },
      metadata: { clientId: context.clientId, apiBaseUrl: baseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  skipDnsValidation: true,
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential")
      throw new ProviderRequestError(400, "ozon requires custom_credential");
    headers.set("Api-Key", requiredString(credential.values.apiKey, "apiKey"));
    headers.set("Client-Id", requiredString(credential.values.clientId, "clientId"));
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});

async function requestOzon(
  path: string,
  body: Record<string, unknown>,
  context: Context,
  phase: "validate" | "execute",
): Promise<unknown> {
  const response = await context.fetcher(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "Api-Key": context.apiKey,
      "Client-Id": context.clientId,
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(body),
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "Ozon returned invalid JSON");
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const message =
      optionalString(record?.message) ||
      optionalString(record?.error) ||
      `Ozon request failed with status ${response.status}`;
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (phase === "validate") throw new ProviderRequestError(400, message);
    throw new ProviderRequestError(response.status, message);
  }
  return payload;
}
function validateIdentifierCount(input: Record<string, unknown>): void {
  const count = [input.offer_id, input.product_id, input.sku].reduce<number>(
    (total, value) => total + (Array.isArray(value) ? value.length : 0),
    0,
  );
  if (count < 1) throw new ProviderRequestError(400, "at least one of offer_id, product_id, or sku is required");
  if (count > 1000)
    throw new ProviderRequestError(400, "offer_id, product_id, and sku may contain at most 1000 identifiers in total");
}
