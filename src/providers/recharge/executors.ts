import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { arrayPayload, firstString, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";

const service = "recharge";
const apiBaseUrl = "https://api.rechargeapps.com";
const apiVersion = "2021-11";

type ResourceName = "customer" | "subscription" | "order" | "charge" | "product";
type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface ResourceSpec {
  singular: ResourceName;
  plural: `${ResourceName}s`;
  path: string;
}

const resources: Record<ResourceName, ResourceSpec> = {
  customer: { singular: "customer", plural: "customers", path: "/customers" },
  subscription: { singular: "subscription", plural: "subscriptions", path: "/subscriptions" },
  order: { singular: "order", plural: "orders", path: "/orders" },
  charge: { singular: "charge", plural: "charges", path: "/charges" },
  product: { singular: "product", plural: "products", path: "/products" },
};

export const rechargeActionHandlers: ProviderActionHandlers<"recharge", Handler> = {
  list_customers(input, context) {
    return listResource(resources.customer, input, context);
  },
  get_customer(input, context) {
    return getResource(resources.customer, input, context);
  },
  list_subscriptions(input, context) {
    return listResource(resources.subscription, input, context);
  },
  get_subscription(input, context) {
    return getResource(resources.subscription, input, context);
  },
  list_orders(input, context) {
    return listResource(resources.order, input, context);
  },
  get_order(input, context) {
    return getResource(resources.order, input, context);
  },
  list_charges(input, context) {
    return listResource(resources.charge, input, context);
  },
  get_charge(input, context) {
    return getResource(resources.charge, input, context);
  },
  list_products(input, context) {
    return listResource(resources.product, input, context);
  },
  get_product(input, context) {
    return getResource(resources.product, input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rechargeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = objectPayload(
      await rechargeRequest("/", { apiKey: input.apiKey, fetcher, signal }, "validate"),
      "Recharge token information",
    );
    const tokenInfo = optionalRecord(payload.token_information);
    const account = optionalRecord(payload.account);
    const store = optionalRecord(payload.store);
    return {
      profile: {
        accountId: optionalString(tokenInfo?.id) ?? optionalString(account?.id),
        displayName:
          firstString(tokenInfo, ["name", "token_name"]) ??
          firstString(account, ["name", "store_name"]) ??
          firstString(store, ["name", "store_name"]) ??
          "Recharge API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        apiVersion,
        validationEndpoint: "/",
      },
    };
  },
};

async function listResource(
  spec: ResourceSpec,
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const raw = objectPayload(await rechargeRequest(spec.path, context, { query: rechargeQuery(input) }), spec.plural);
  return {
    [spec.plural]: arrayPayload(raw[spec.plural], spec.plural),
    nextCursor: optionalString(raw.next_cursor) ?? null,
    previousCursor: optionalString(raw.previous_cursor) ?? null,
    raw,
  };
}

async function getResource(
  spec: ResourceSpec,
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const id = encodePathSegment(requiredString(input.id, "id"));
  const raw = objectPayload(
    await rechargeRequest(`${spec.path}/${id}`, context, { query: includeQuery(input) }),
    spec.singular,
  );
  return {
    [spec.singular]: objectPayload(raw[spec.singular], spec.singular),
    raw,
  };
}

function rechargeRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  options:
    | "validate"
    | {
        query?: Record<string, string | number | undefined>;
      } = {},
): Promise<unknown> {
  const phase = options === "validate" ? "validate" : "execute";
  const requestOptions = typeof options === "object" ? options : {};
  return requestJson({
    providerName: "Recharge",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    query: requestOptions.query,
    phase,
    headers: {
      "x-recharge-access-token": context.apiKey,
      "x-recharge-version": apiVersion,
    },
  });
}

function rechargeQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    ...includeQuery(input),
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
    ids: Array.isArray(input.ids) ? input.ids.map(String).join(",") : undefined,
    sort_by: optionalString(input.sortBy),
    created_at_min: optionalString(input.createdAtMin),
    created_at_max: optionalString(input.createdAtMax),
    updated_at_min: optionalString(input.updatedAtMin),
    updated_at_max: optionalString(input.updatedAtMax),
    address_id: optionalString(input.addressId),
    charge_id: optionalString(input.chargeId),
    collection_id: optionalString(input.collectionId),
    customer_id: optionalString(input.customerId),
    discount_code: optionalString(input.discountCode),
    discount_id: optionalString(input.discountId),
    email: optionalString(input.email),
    external_order_id: optionalString(input.externalOrderId),
    external_product_id: optionalString(input.externalProductId),
    processed_at_min: optionalString(input.processedAtMin),
    processed_at_max: optionalString(input.processedAtMax),
    product_title: optionalString(input.productTitle),
    purchase_item_id: optionalString(input.purchaseItemId),
    scheduled_at: optionalString(input.scheduledAt),
    scheduled_at_min: optionalString(input.scheduledAtMin),
    scheduled_at_max: optionalString(input.scheduledAtMax),
    status: optionalString(input.status),
    title: optionalString(input.title),
  });
}

function includeQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    include: Array.isArray(input.include) ? input.include.map(String).join(",") : undefined,
  };
}
