import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderActionSources } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { mapProviderActionSources, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const samcartApiBaseUrl = "https://api.samcart.com/v1";
interface RequestShape {
  path: string;
  list: boolean;
}
const requests: ProviderActionSources<"samcart", RequestShape> = {
  list_customers: { path: "/customers", list: true },
  get_customer: { path: "/customers/:id", list: false },
  list_products: { path: "/products", list: true },
  get_product: { path: "/products/:id", list: false },
  list_orders: { path: "/orders", list: true },
  get_order: { path: "/orders/:id", list: false },
  list_subscriptions: { path: "/subscriptions", list: true },
  get_subscription: { path: "/subscriptions/:id", list: false },
};

export const samcartActionHandlers: ProviderActionHandlers<
  "samcart",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = mapProviderActionSources(
  "samcart",
  requests,
  (name, requestShape): ((input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>) =>
    async (input, context) => {
      const path = requestShape.path.includes(":id")
        ? requestShape.path.replace(
            ":id",
            encodeURIComponent(requiredString(input.id, "id", (message) => new ProviderRequestError(400, message))),
          )
        : requestShape.path;
      const payload = await request(path, requestShape.list ? input : {}, context, "execute");
      return requestShape.list ? readList(payload, name) : readObject(payload, name);
    },
);

export async function validateSamcartApiKey(context: ApiKeyProviderContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  readList(await request("/products", { limit: 1 }, context, "validate"), "products");
  return {
    profile: { accountId: "api_key", displayName: "SamCart API Token" },
    grantedScopes: [],
    metadata: { apiBaseUrl: samcartApiBaseUrl, validationEndpoint: "/products" },
  };
}

async function request(
  path: string,
  query: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${samcartApiBaseUrl}/`);
  for (const [key, value] of Object.entries(compactObject(query))) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "sc-api": context.apiKey, "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(502, "SamCart returned invalid JSON");
    }
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const message =
      optionalString(record?.message) ??
      optionalString(record?.error) ??
      `SamCart request failed with status ${response.status}`;
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (phase === "validate" && (response.status === 401 || response.status === 403))
      throw new ProviderRequestError(400, message);
    if (phase === "execute" && response.status === 401) throw new ProviderRequestError(401, message);
    throw new ProviderRequestError(response.status, message);
  }
  return payload;
}
function readObject(payload: unknown, name: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, `SamCart ${name} returned invalid JSON`);
  return record;
}
function readList(payload: unknown, name: string): Record<string, unknown> {
  const record = readObject(payload, name);
  if (!Array.isArray(record.data))
    throw new ProviderRequestError(502, `SamCart ${name} response did not include a data array`);
  return record;
}
