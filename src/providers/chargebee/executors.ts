import type { QueryValue } from "../../core/request.ts";
import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ChargebeeActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "chargebee";
const apiVersionSegment = "api/v2";

interface ChargebeeContext {
  apiKey: string;
  site: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type Handler = (input: Record<string, unknown>, context: ChargebeeContext) => Promise<unknown>;

export const chargebeeActionHandlers: Record<ChargebeeActionName, Handler> = {
  list_customers(input, context) {
    return listWrapped("customers", "customer", input, context);
  },
  async get_customer(input, context) {
    return {
      customer: unwrap(
        await requestChargebeeJson(
          context,
          `/customers/${encodeURIComponent(requiredString(input.customerId, "customerId"))}`,
        ),
        "customer",
      ),
    };
  },
  async create_customer(input, context) {
    return {
      customer: unwrap(
        await requestChargebeeJson(context, "/customers", { method: "POST", form: buildCustomerForm(input) }),
        "customer",
      ),
    };
  },
  list_subscriptions(input, context) {
    return listWrapped("subscriptions", "subscription", input, context);
  },
  async get_subscription(input, context) {
    return {
      subscription: unwrap(
        await requestChargebeeJson(
          context,
          `/subscriptions/${encodeURIComponent(requiredString(input.subscriptionId, "subscriptionId"))}`,
        ),
        "subscription",
      ),
    };
  },
  list_invoices(input, context) {
    return listWrapped("invoices", "invoice", input, context);
  },
  async get_invoice(input, context) {
    return {
      invoice: unwrap(
        await requestChargebeeJson(
          context,
          `/invoices/${encodeURIComponent(requiredString(input.invoiceId, "invoiceId"))}`,
        ),
        "invoice",
      ),
    };
  },
  list_item_prices(input, context) {
    return listWrapped("item_prices", "item_price", input, context, "itemPrices");
  },
  async get_item_price(input, context) {
    return {
      itemPrice: unwrap(
        await requestChargebeeJson(
          context,
          `/item_prices/${encodeURIComponent(requiredString(input.itemPriceId, "itemPriceId"))}`,
        ),
        "item_price",
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ChargebeeContext>({
  service,
  handlers: chargebeeActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ChargebeeContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      site: normalizeChargebeeSite(credential.values.site ?? optionalString(credential.metadata.site)),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildChargebeeApiBaseUrl(
      normalizeChargebeeSite(credential.values.site ?? optionalString(credential.metadata.site)),
    );
  },
  auth: { type: "api_key_basic", suffix: ":" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const site = normalizeChargebeeSite(input.values.site);
    const context = { apiKey: input.apiKey, site, fetcher, signal };
    const payload = await requestChargebeeJson(context, "/customers", { query: { limit: 1 } });
    const list = normalizeListPayload(payload);
    const firstCustomer = optionalRecord(optionalRecord(list.list[0])?.customer);
    return {
      profile: {
        accountId: `chargebee:${site}`,
        displayName: `Chargebee ${site}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        site,
        apiBaseUrl: buildChargebeeApiBaseUrl(site),
        validationEndpoint: "/api/v2/customers?limit=1",
        credentialHelpUrl: "https://www.chargebee.com/docs/api_keys.html",
        sampleCustomerId: optionalString(firstCustomer?.id),
      }),
    };
  },
};

async function listWrapped(
  path: string,
  wrapper: string,
  input: Record<string, unknown>,
  context: ChargebeeContext,
  outputKey = path,
): Promise<unknown> {
  const payload = await requestChargebeeJson(context, `/${path}`, { query: buildListQuery(input) });
  const list = normalizeListPayload(payload);
  return {
    [outputKey]: list.list.map((item) => unwrap(item, wrapper)),
    nextOffset: optionalString(list.next_offset) ?? null,
  };
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    limit: optionalInteger(input.limit),
    offset: optionalString(input.offset),
    "id[is]": optionalString(input.id),
    "customer_id[is]": optionalString(input.customerId),
    "subscription_id[is]": optionalString(input.subscriptionId),
    "email[is]": optionalString(input.email),
    "status[is]": optionalString(input.status),
    "item_id[is]": optionalString(input.itemId),
    sort_by: optionalString(input.sortBy),
    sort_order: optionalString(input.sortOrder),
  });
}

function buildCustomerForm(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return {
    id: optionalString(input.id),
    email: optionalString(input.email),
    first_name: optionalString(input.firstName),
    last_name: optionalString(input.lastName),
    phone: optionalString(input.phone),
    company: optionalString(input.company),
    vat_number: optionalString(input.vatNumber),
    auto_collection: optionalString(input.autoCollection),
    net_term_days: optionalInteger(input.netTermDays),
    ...Object.fromEntries(
      Object.entries(optionalRecord(input.metadata) ?? {}).map(([key, value]) => [`meta_data[${key}]`, String(value)]),
    ),
  };
}

async function requestChargebeeJson(
  context: ChargebeeContext,
  path: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, unknown>;
    form?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<unknown> {
  const url = new URL(`${buildChargebeeApiBaseUrl(context.site)}${path}`);
  for (const [key, value] of Object.entries(queryParams((options.query ?? {}) as Record<string, QueryValue>))) {
    url.searchParams.set(key, value);
  }
  const body = options.form
    ? new URLSearchParams(queryParams(options.form as Record<string, QueryValue>)).toString()
    : undefined;
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${context.apiKey}:`).toString("base64")}`,
      "user-agent": providerUserAgent,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
    signal: context.signal,
  });
  const payload = await readJson(response);
  if (!response.ok) throw createChargebeeError(response, payload);
  return payload;
}

function normalizeListPayload(payload: unknown): { list: unknown[]; next_offset?: unknown } {
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.list)) throw new ProviderRequestError(502, "invalid Chargebee list response");
  return { list: record.list, next_offset: record.next_offset };
}

function unwrap(payload: unknown, key: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  const value = optionalRecord(record?.[key]);
  if (!value) throw new ProviderRequestError(502, `invalid Chargebee ${key} response`);
  return value;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Chargebee returned invalid JSON");
  }
}

function normalizeChargebeeSite(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new ProviderRequestError(400, "site is required");
  let candidate = trimmed;
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) candidate = new URL(candidate).hostname;
  const suffix = ".chargebee.com";
  if (candidate.toLowerCase().endsWith(suffix)) candidate = candidate.slice(0, -suffix.length);
  const normalized = candidate.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized))
    throw new ProviderRequestError(400, "site must be a Chargebee site name or URL");
  return normalized;
}

function buildChargebeeApiBaseUrl(site: string): string {
  return `https://${site}.chargebee.com/${apiVersionSegment}`;
}

function createChargebeeError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error_msg) ??
    response.statusText ??
    `Chargebee request failed with HTTP ${response.status}`;
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}
