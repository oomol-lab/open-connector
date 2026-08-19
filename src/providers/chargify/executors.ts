import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
interface Context {
  siteUrl: string;
  authorization: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
function siteUrl(value: string | undefined): string {
  if (!value) throw new ProviderRequestError(401, "Configure the Maxio site URL first.");
  const url = new URL(value);
  const labels = url.hostname.toLowerCase().split(".");
  const official =
    (labels.length === 3 && labels[1] === "chargify" && labels[2] === "com") ||
    (labels.length === 4 && labels[1] === "ebilling" && labels[2] === "maxio" && labels[3] === "com");
  if (
    url.protocol !== "https:" ||
    !official ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash ||
    !validSiteLabel(labels[0] ?? "")
  )
    throw new ProviderRequestError(400, "siteUrl must be an official Maxio site URL");
  return `https://${url.hostname.toLowerCase()}`;
}
function validSiteLabel(value: string): boolean {
  if (!value || value.length > 63 || value.startsWith("-") || value.endsWith("-")) return false;
  return [...value].every(
    (character) =>
      (character >= "a" && character <= "z") || (character >= "0" && character <= "9") || character === "-",
  );
}
async function request(
  resource: string,
  id: unknown,
  input: Record<string, unknown>,
  context: Context,
): Promise<unknown> {
  const plural = `${resource}s`;
  const url = new URL(id === undefined ? `/${plural}.json` : `/${plural}/${id}.json`, context.siteUrl);
  const queryNames: Record<string, string> = {
    perPage: "per_page",
    query: "q",
    includeArchived: "include_archived",
    productId: "product",
  };
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && key !== `${resource}Id`) {
      url.searchParams.set(queryNames[key] ?? key, String(value));
    }
  }
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", authorization: context.authorization, "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ProviderRequestError(response.status, `Maxio request failed with ${response.status}`, payload);
  return payload;
}
function unwrap(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}
function normalize(value: unknown, resource: "customer" | "product" | "subscription"): Record<string, unknown> {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (resource === "customer")
    return {
      id: raw.id ?? null,
      firstName: raw.first_name ?? null,
      lastName: raw.last_name ?? null,
      email: raw.email ?? null,
      organization: raw.organization ?? null,
      reference: raw.reference ?? null,
      raw,
    };
  if (resource === "product")
    return {
      id: raw.id ?? null,
      name: raw.name ?? null,
      handle: raw.handle ?? null,
      priceInCents: raw.price_in_cents ?? null,
      interval: raw.interval ?? null,
      intervalUnit: raw.interval_unit ?? null,
      archivedAt: raw.archived_at ?? null,
      raw,
    };
  const customer = raw.customer as Record<string, unknown> | undefined;
  const product = raw.product as Record<string, unknown> | undefined;
  return {
    id: raw.id ?? null,
    state: raw.state ?? null,
    customerId: customer?.id ?? null,
    productId: product?.id ?? null,
    currentPeriodEndsAt: raw.current_period_ends_at ?? null,
    nextAssessmentAt: raw.next_assessment_at ?? null,
    currency: raw.currency ?? null,
    raw,
  };
}
const handlers: ProviderActionHandlers<"chargify", ProviderRuntimeHandler<Context>> = {
  async list_customers(input, context) {
    const payload = await request("customer", undefined, input, context);
    return {
      customers: Array.isArray(payload) ? payload.map((item) => normalize(unwrap(item, "customer"), "customer")) : [],
      page: input.page ?? 1,
      hasMore: Array.isArray(payload) && payload.length === (input.perPage ?? 20),
    };
  },
  async get_customer(input, context) {
    return {
      customer: normalize(unwrap(await request("customer", input.customerId, {}, context), "customer"), "customer"),
    };
  },
  async list_products(input, context) {
    const payload = await request("product", undefined, input, context);
    return {
      products: Array.isArray(payload) ? payload.map((item) => normalize(unwrap(item, "product"), "product")) : [],
      page: input.page ?? 1,
      hasMore: Array.isArray(payload) && payload.length === (input.perPage ?? 20),
    };
  },
  async get_product(input, context) {
    return {
      product: normalize(unwrap(await request("product", input.productId, {}, context), "product"), "product"),
    };
  },
  async list_subscriptions(input, context) {
    const payload = await request("subscription", undefined, input, context);
    return {
      subscriptions: Array.isArray(payload)
        ? payload.map((item) => normalize(unwrap(item, "subscription"), "subscription"))
        : [],
      page: input.page ?? 1,
      hasMore: Array.isArray(payload) && payload.length === (input.perPage ?? 20),
    };
  },
  async get_subscription(input, context) {
    return {
      subscription: normalize(
        unwrap(await request("subscription", input.subscriptionId, {}, context), "subscription"),
        "subscription",
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service: "chargify",
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "chargify");
    return {
      siteUrl: siteUrl(credential.values.siteUrl),
      authorization: `Basic ${Buffer.from(`${credential.apiKey}:x`).toString("base64")}`,
      fetcher,
      signal: context.signal,
    };
  },
  handlers,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const resolvedSiteUrl = siteUrl(input.values.siteUrl);
    const authorization = `Basic ${Buffer.from(`${input.apiKey}:x`).toString("base64")}`;
    const response = await fetcher(new URL("/site.json", resolvedSiteUrl), {
      headers: { accept: "application/json", authorization, "user-agent": providerUserAgent },
      signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new ProviderRequestError(
        response.status < 500 ? 400 : response.status,
        `Maxio request failed with ${response.status}`,
        payload,
      );
    const site = unwrap(payload, "site");
    if (!site || typeof site !== "object") throw new ProviderRequestError(502, "Maxio response is missing site");
    const record = site as Record<string, unknown>;
    const subdomain =
      typeof record.subdomain === "string" ? record.subdomain : new URL(resolvedSiteUrl).hostname.split(".")[0]!;
    const siteId = typeof record.id === "number" ? record.id : undefined;
    return {
      profile: {
        accountId: `chargify:${siteId ?? subdomain}`,
        displayName: typeof record.name === "string" ? record.name : `Maxio ${subdomain}`,
      },
      grantedScopes: [],
      metadata: {
        siteUrl: resolvedSiteUrl,
        validationEndpoint: "/site.json",
        ...(siteId === undefined ? {} : { siteId }),
        subdomain,
        ...(typeof record.currency === "string" ? { currency: record.currency } : {}),
        ...(typeof record.test === "boolean" ? { test: record.test } : {}),
        credentialHelpUrl: "https://docs.maxio.com/hc/en-us/articles/24294819360525-Advanced-Billing-API-Keys",
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "chargify",
  async baseUrl(context) {
    return siteUrl((await requireApiKeyCredential(context, "chargify")).values.siteUrl);
  },
  auth: { type: "api_key_basic", suffix: ":x" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});
