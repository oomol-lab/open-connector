import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
export const slicktextApiBaseUrl = "https://dev.slicktext.com/v1";

export const slicktextActionHandlers: ProviderActionHandlers<
  "slicktext",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  get_brand(_input, context) {
    return request("/brands", "GET", undefined, undefined, context, "execute");
  },
  async list_contacts(input, context) {
    const brandId = await resolveBrandId(context);
    return request(`/brands/${brandId}/contacts`, "GET", pagination(input), undefined, context, "execute");
  },
  async get_contact(input, context) {
    return contact(input, context, "GET");
  },
  async create_contact(input, context) {
    const id = await resolveBrandId(context);
    return request(`/brands/${id}/contacts`, "POST", undefined, input, context, "execute");
  },
  async update_contact(input, context) {
    return contact(input, context, "PUT");
  },
  async delete_contact(input, context) {
    return contact(input, context, "DELETE");
  },
};
export async function validateSlicktext(context: ApiKeyProviderContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const brand = object(
    await request("/brands", "GET", undefined, undefined, context, "validate"),
    "SlickText brand response",
  );
  const id = positiveInteger(brand.brand_id, "brand_id");
  const name = optionalString(brand.name);
  return {
    profile: { accountId: String(id), displayName: name ?? `SlickText Brand ${id}` },
    grantedScopes: [],
    metadata: { apiBaseUrl: slicktextApiBaseUrl, validationEndpoint: "/brands", brandId: id },
  };
}
async function contact(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  method: "GET" | "PUT" | "DELETE",
): Promise<unknown> {
  const id = await resolveBrandId(context);
  const contactId = positiveInteger(input.contact_id, "contact_id");
  const body = { ...input };
  delete body.contact_id;
  return request(
    `/brands/${id}/contacts/${contactId}`,
    method,
    undefined,
    method === "PUT" ? body : undefined,
    context,
    "execute",
  );
}
async function resolveBrandId(context: ApiKeyProviderContext): Promise<number> {
  const brand = object(
    await request("/brands", "GET", undefined, undefined, context, "execute"),
    "SlickText brand response",
  );
  return positiveInteger(brand.brand_id, "brand_id");
}
async function request(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  query: URLSearchParams | undefined,
  body: Record<string, unknown> | undefined,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(path.slice(1), `${slicktextApiBaseUrl}/`);
  if (query) url.search = query.toString();
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      ...(body ? { "content-type": "application/json" } : {}),
      "user-agent": providerUserAgent,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(502, "SlickText returned invalid JSON");
    }
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const message =
      optionalString(record?.message) ??
      optionalString(record?.error) ??
      `SlickText request failed with status ${response.status}`;
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (phase === "validate" && response.status < 500) throw new ProviderRequestError(400, message);
    if (response.status === 401 || response.status === 403) throw new ProviderRequestError(401, message);
    throw new ProviderRequestError(response.status < 500 ? 400 : 502, message);
  }
  return payload;
}
function pagination(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  for (const name of ["limit", "offset", "page", "pageSize"]) {
    const value = optionalInteger(input[name]);
    if (value !== undefined) query.set(name, String(value));
  }
  return query;
}
function object(value: unknown, label: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `${label} was invalid`);
  return result;
}
function positiveInteger(value: unknown, field: string): number {
  const result = optionalInteger(value);
  if (result === undefined || result <= 0) throw new ProviderRequestError(502, `SlickText ${field} was invalid`);
  return result;
}
