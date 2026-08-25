import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "dealmachine";
const baseUrl = "https://api.v2.dealmachine.com/v1";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: Record<string, Handler> = {
  async get_account(_input, context) {
    return requireRecord(
      requireRecord(await request("/account", context), "DealMachine account response").data,
      "DealMachine account data",
    );
  },
  list_filters(input, context) {
    return request("/filters", context, { query: input });
  },
  list_fields(input, context) {
    return request("/fields", context, { query: input });
  },
  get_property(input, context) {
    const id = requireString(input.id, "id");
    return request(`/properties/${encodeURIComponent(id)}`, context, {
      query: compactObject({
        enrich: scalar(input.enrich),
        contact_audience: input.contact_audience,
        fields: Array.isArray(input.fields) ? input.fields.join(",") : undefined,
      }),
    });
  },
  count_properties(input, context) {
    return request("/properties/search/count", context, { method: "POST", body: input });
  },
  search_properties(input, context) {
    return request("/properties/search", context, { method: "POST", body: input });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const account = requireRecord(
      requireRecord(await request("/account", context, { phase: "validate" }), "DealMachine account response").data,
      "DealMachine account data",
    );
    const organization = requireRecord(account.organization, "DealMachine organization");
    const id = organization.id;
    return {
      profile: {
        accountId: `dealmachine:${typeof id === "string" || typeof id === "number" ? id : "account"}`,
        displayName: optionalString(organization.name) || "DealMachine",
      },
      metadata: { apiBaseUrl: baseUrl, organizationId: id },
    };
  },
};

interface Options {
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}
async function request(path: string, context: ApiKeyProviderContext, options: Options = {}): Promise<unknown> {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    const item = scalar(value);
    if (item !== undefined) url.searchParams.set(key, item);
  }
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      "user-agent": providerUserAgent,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "DealMachine returned invalid JSON");
  }
  if (!response.ok) {
    const error = optionalRecord(optionalRecord(payload)?.error);
    const message = optionalString(error?.message) || `DealMachine request failed with status ${response.status}`;
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (options.phase === "validate" && (response.status === 401 || response.status === 403))
      throw new ProviderRequestError(400, message);
    throw new ProviderRequestError(response.status, message);
  }
  return payload;
}
function scalar(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : undefined;
}
function requireRecord(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${context} is not an object`);
  return record;
}
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, `${field} is required`);
  return value.trim();
}
