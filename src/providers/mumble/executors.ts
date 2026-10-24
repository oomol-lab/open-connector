import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import {
  compactObject,
  optionalRecord,
  optionalString,
  objectArray,
  requiredBoolean,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import { ProviderRequestError, providerResponseError, providerUserAgent } from "../provider-runtime.ts";

const service = "mumble";
const baseUrl = "https://app.mumble.co.il/mumbleapi";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: ProviderActionHandlers<"mumble", Handler> = {
  create_customer: (input, context) => mutate("/add-new-customer", "POST", customerBody(input), context),
  update_customer: (input, context) =>
    mutate("/edit-customer", "POST", { ...optionalRecord(input.customFields), ...customerBody(input) }, context),
  async get_customer(input, context) {
    const data = requiredRecord(
      await request("/get-customer", "GET", context, undefined, {
        customer_phone: requiredString(input.customerPhone, "customerPhone"),
      }),
      "Mumble response",
    );
    return { customer: requiredRecord(data.customer, "Mumble customer") };
  },
  async list_customers(input, context) {
    const data = requiredRecord(
      await request(
        "/get-all-customers",
        "GET",
        context,
        undefined,
        input.page === undefined ? undefined : { page: String(input.page) },
      ),
      "Mumble response",
    );
    return {
      customers: objectArray(data.customers, "Mumble customers", providerResponseError),
      total: data.total ?? null,
      currentPage: data.current_page ?? null,
      perPage: data.per_page ?? null,
      totalPages: data.total_pages ?? data.pages ?? null,
    };
  },
  delete_customer: (input, context) =>
    mutate(
      "/delete-customer",
      "DELETE",
      { customer_phone: requiredString(input.customerPhone, "customerPhone") },
      context,
    ),
  create_label: (input, context) =>
    mutate("/add-new-label", "POST", { label_name: requiredString(input.labelName, "labelName") }, context),
  async list_labels(_input, context) {
    const data = requiredRecord(await request("/get-labels", "GET", context), "Mumble response");
    return { labels: requiredStringArray(data.labels, "Mumble labels", providerResponseError) };
  },
  delete_label: (input, context) =>
    mutate("/delete-label", "DELETE", { label_name: requiredString(input.labelName, "labelName") }, context),
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "Mumble-Api-Key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    await handlers.list_labels({}, context);
    return {
      profile: { displayName: "Mumble API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/get-labels" },
    };
  },
};
function customerBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...optionalRecord(input.marketingAttribution),
    ...compactObject({
      customer_phone: requiredString(input.customerPhone, "customerPhone"),
      name: optionalString(input.name),
      email: optionalString(input.email),
      source: optionalString(input.source),
      bot_token: optionalString(input.botToken),
    }),
  };
}
async function mutate(
  path: string,
  method: "POST" | "DELETE",
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const data = requiredRecord(await request(path, method, context, body), "Mumble response");
  return { success: requiredBoolean(data.success, "Mumble success"), message: optionalString(data.message) ?? null };
}
async function request(
  path: string,
  method: string,
  context: ApiKeyProviderContext,
  body?: Record<string, unknown>,
  query?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "mumble-api-key": context.apiKey,
      "user-agent": providerUserAgent,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await readProviderTextBody(response, "Mumble response");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "Mumble returned invalid JSON");
  }
  if (!response.ok) {
    const record = optionalRecord(data);
    throw new ProviderRequestError(
      response.status,
      optionalString(record?.message) ??
        optionalString(record?.error) ??
        `Mumble request failed with status ${response.status}`,
    );
  }
  return data;
}
