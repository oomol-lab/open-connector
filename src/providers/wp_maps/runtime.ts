import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { WpMapsActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerInputError, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const wpMapsApiBaseUrl = "https://svr.wpmaps.net/v1";
interface WpMapsCredential {
  accessToken: string;
  clientId: string;
}
interface Context {
  credential: WpMapsCredential;
  fetcher: typeof fetch;
}
type Phase = "validate" | "execute";

const handlers: Record<WpMapsActionName, (input: Record<string, unknown>, context: Context) => Promise<unknown>> = {
  create_products: (input, context) => request("/products/save", "POST", input, context, { data: input.products }),
  update_products: (input, context) => request("/products/save", "POST", input, context, { data: input.products }),
  get_product: (input, context) =>
    request(`/products/get/${positiveInteger(input.productId, "productId")}`, "GET", input, context),
  list_products: (input, context) => request("/products/all", "GET", input, context),
  delete_products: (input, context) => request("/products/delete", "POST", input, context, { ids: input.productIds }),
  create_stores: (input, context) =>
    request(
      "/stores/save",
      "POST",
      input,
      context,
      compactObject({ data: input.stores, geocoder: optionalString(input.geocoder) }),
    ),
  update_stores: (input, context) =>
    request(
      "/stores/save",
      "POST",
      input,
      context,
      compactObject({ data: input.stores, geocoder: optionalString(input.geocoder) }),
    ),
  get_store: (input, context) =>
    request(`/stores/get/${positiveInteger(input.storeId, "storeId")}`, "GET", input, context),
  list_stores: (input, context) => request("/stores/all", "GET", input, context),
  delete_stores: (input, context) => request("/stores/delete", "POST", input, context, { ids: input.storeIds }),
};
export const wpMapsActionHandlers: ProviderActionHandlers<"wp_maps", ProviderRuntimeHandler<Context>> = handlers;

export function readWpMapsCredential(accessToken: string, values: Record<string, unknown>): WpMapsCredential {
  return {
    accessToken: requiredString(accessToken, "apiKey", providerInputError),
    clientId: requiredString(values.clientId, "clientId", providerInputError),
  };
}
export async function validateWpMapsCredential(
  accessToken: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[] }> {
  const credential = readWpMapsCredential(accessToken, values);
  const payload = optionalRecord(
    await requestJson("/products/all", "GET", credential, undefined, undefined, fetcher, "validate"),
  );
  if (!Array.isArray(payload?.data) || !Array.isArray(payload.header))
    throw new ProviderRequestError(502, "WP Maps returned an invalid product list");
  return { profile: { displayName: "WP Maps Account" }, grantedScopes: [] };
}

function request(
  path: string,
  method: "GET" | "POST",
  input: Record<string, unknown>,
  context: Context,
  body?: unknown,
): Promise<unknown> {
  return requestJson(
    path,
    method,
    context.credential,
    optionalString(input.language),
    body,
    context.fetcher,
    "execute",
  );
}
async function requestJson(
  path: string,
  method: "GET" | "POST",
  credential: WpMapsCredential,
  language: string | undefined,
  body: unknown,
  fetcher: typeof fetch,
  phase: Phase,
): Promise<unknown> {
  const url = new URL(path.slice(1), `${wpMapsApiBaseUrl}/`);
  url.searchParams.set("access_token", credential.accessToken);
  url.searchParams.set("client_id", credential.clientId);
  if (language) url.searchParams.set("lang", language);
  const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await fetcher(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim())
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "WP Maps returned invalid JSON");
    }
  if (!response.ok) throw mapError(response.status, payload, phase);
  if (!optionalRecord(payload)) throw new ProviderRequestError(502, "WP Maps returned an invalid payload");
  return payload;
}
function mapError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ?? optionalString(record?.error) ?? `WP Maps request failed with status ${status}`;
  if (status === 400 || status === 401 || status === 403)
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new ProviderRequestError(400, `WP Maps ${field} must be a positive integer`);
  return value;
}
