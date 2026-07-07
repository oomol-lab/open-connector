import type { ShopifyAdminActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const shopifyAdminApiVersion = "2026-04";

const credentialHelpUrl = "https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens";
const currentShopQuery =
  "query ShopifyAdminCurrentShop { shop { id name myshopifyDomain primaryDomain { url host } } }";
const getShopQuery = "query ShopifyAdminGetShop { shop { id name myshopifyDomain primaryDomain { url host } } }";
const listProductsQuery = `query ShopifyAdminListProducts($first: Int, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        handle
        status
        vendor
        productType
        createdAt
        updatedAt
        onlineStoreUrl
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;
const getProductQuery = `query ShopifyAdminGetProduct($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    status
    vendor
    productType
    descriptionHtml
    createdAt
    updatedAt
    onlineStoreUrl
  }
}`;
const listProductVariantsQuery = `query ShopifyAdminListProductVariants($first: Int, $after: String, $query: String) {
  productVariants(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        sku
        price
        inventoryQuantity
        product {
          id
          title
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;
const listOrdersQuery = `query ShopifyAdminListOrders($first: Int, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        name
        email
        phone
        displayFinancialStatus
        displayFulfillmentStatus
        currencyCode
        createdAt
        updatedAt
        customer {
          id
          displayName
        }
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;
const getOrderQuery = `query ShopifyAdminGetOrder($id: ID!) {
  order(id: $id) {
    id
    name
    email
    phone
    displayFinancialStatus
    displayFulfillmentStatus
    currencyCode
    createdAt
    updatedAt
    customer {
      id
      displayName
    }
    currentTotalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
  }
}`;
const listCustomersQuery = `query ShopifyAdminListCustomers($first: Int, $after: String, $query: String) {
  customers(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        displayName
        firstName
        lastName
        defaultEmailAddress {
          emailAddress
        }
        defaultPhoneNumber {
          phoneNumber
        }
        state
        tags
        numberOfOrders
        amountSpent {
          amount
          currencyCode
        }
        createdAt
        updatedAt
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;
const getCustomerQuery = `query ShopifyAdminGetCustomer($id: ID!) {
  customer(id: $id) {
    id
    displayName
    firstName
    lastName
    defaultEmailAddress {
      emailAddress
    }
    defaultPhoneNumber {
      phoneNumber
    }
    state
    tags
    numberOfOrders
    amountSpent {
      amount
      currencyCode
    }
    createdAt
    updatedAt
  }
}`;
const listInventoryItemsQuery = `query ShopifyAdminListInventoryItems($first: Int, $after: String, $query: String) {
  inventoryItems(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        sku
        tracked
        requiresShipping
        countryCodeOfOrigin
        harmonizedSystemCode
        createdAt
        updatedAt
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;
const getInventoryItemQuery = `query ShopifyAdminGetInventoryItem($id: ID!) {
  inventoryItem(id: $id) {
    id
    sku
    tracked
    requiresShipping
    countryCodeOfOrigin
    harmonizedSystemCode
    createdAt
    updatedAt
  }
}`;
const listLocationsQuery = `query ShopifyAdminListLocations(
  $first: Int,
  $after: String,
  $query: String,
  $includeInactive: Boolean,
  $includeLegacy: Boolean
) {
  locations(
    first: $first,
    after: $after,
    query: $query,
    includeInactive: $includeInactive,
    includeLegacy: $includeLegacy
  ) {
    edges {
      cursor
      node {
        id
        name
        isActive
        fulfillsOnlineOrders
        address {
          address1
          city
          province
          country
          zip
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;
const getLocationQuery = `query ShopifyAdminGetLocation($id: ID!) {
  location(id: $id) {
    id
    name
    isActive
    fulfillsOnlineOrders
    address {
      address1
      city
      province
      country
      zip
    }
  }
}`;
const listCollectionsQuery = `query ShopifyAdminListCollections($first: Int, $after: String, $query: String) {
  collections(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        handle
        description
        descriptionHtml
        updatedAt
        image {
          url
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;
const getCollectionQuery = `query ShopifyAdminGetCollection($id: ID!) {
  collection(id: $id) {
    id
    title
    handle
    description
    descriptionHtml
    updatedAt
    image {
      url
    }
  }
}`;

type ShopifyAdminActionHandler = (
  input: Record<string, unknown>,
  context: ShopifyAdminActionContext,
) => Promise<unknown>;

interface ShopifyAdminActionContext {
  apiKey: string;
  shopDomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ShopifyAdminGraphQLResponse {
  data?: unknown;
  errors?: unknown;
  extensions?: unknown;
}

interface ShopifyAdminGraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

interface ShopifyAdminShop {
  id: string;
  name: string;
  myshopifyDomain: string;
  primaryDomainUrl: string | null;
  primaryDomainHost: string | null;
  raw: Record<string, unknown>;
}

export const shopifyAdminActionHandlers: Record<ShopifyAdminActionName, ShopifyAdminActionHandler> = {
  async get_shop(_input, context) {
    const payload = await requestShopifyAdminGraphQL(context, { query: getShopQuery });
    return { shop: normalizeShop(readObject(readObject(payload.data, "data").shop, "shop")) };
  },
  async list_products(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: listProductsQuery,
      variables: connectionVariables(input),
    });
    const products = readObject(readObject(payload.data, "data").products, "products");
    return {
      products: readEdges(products).map((edge) => normalizeProductSummary(edge)),
      pageInfo: normalizePageInfo(readObject(products.pageInfo, "pageInfo")),
    };
  },
  async get_product(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: getProductQuery,
      variables: { id: input.id },
    });
    const product = readNullableObject(readObject(payload.data, "data").product, "product");
    return { product: product ? normalizeProductDetail(product) : null };
  },
  async list_product_variants(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: listProductVariantsQuery,
      variables: connectionVariables(input),
    });
    const variants = readObject(readObject(payload.data, "data").productVariants, "productVariants");
    return {
      variants: readEdges(variants).map((edge) => normalizeVariant(edge)),
      pageInfo: normalizePageInfo(readObject(variants.pageInfo, "pageInfo")),
    };
  },
  async list_orders(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: listOrdersQuery,
      variables: connectionVariables(input),
    });
    const orders = readObject(readObject(payload.data, "data").orders, "orders");
    return {
      orders: readEdges(orders).map((edge) => normalizeOrder(edge)),
      pageInfo: normalizePageInfo(readObject(orders.pageInfo, "pageInfo")),
    };
  },
  async get_order(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: getOrderQuery,
      variables: { id: input.id },
    });
    const order = readNullableObject(readObject(payload.data, "data").order, "order");
    return { order: order ? normalizeOrderDetail(order) : null };
  },
  async list_customers(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: listCustomersQuery,
      variables: connectionVariables(input),
    });
    const customers = readObject(readObject(payload.data, "data").customers, "customers");
    return {
      customers: readEdges(customers).map((edge) => normalizeCustomer(edge)),
      pageInfo: normalizePageInfo(readObject(customers.pageInfo, "pageInfo")),
    };
  },
  async get_customer(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: getCustomerQuery,
      variables: { id: input.id },
    });
    const customer = readNullableObject(readObject(payload.data, "data").customer, "customer");
    return { customer: customer ? normalizeCustomerDetail(customer) : null };
  },
  async list_inventory_items(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: listInventoryItemsQuery,
      variables: connectionVariables(input),
    });
    const inventoryItems = readObject(readObject(payload.data, "data").inventoryItems, "inventoryItems");
    return {
      inventoryItems: readEdges(inventoryItems).map((edge) => normalizeInventoryItem(edge)),
      pageInfo: normalizePageInfo(readObject(inventoryItems.pageInfo, "pageInfo")),
    };
  },
  async get_inventory_item(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: getInventoryItemQuery,
      variables: { id: input.id },
    });
    const inventoryItem = readNullableObject(readObject(payload.data, "data").inventoryItem, "inventoryItem");
    return { inventoryItem: inventoryItem ? normalizeInventoryItemDetail(inventoryItem) : null };
  },
  async list_locations(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: listLocationsQuery,
      variables: locationConnectionVariables(input),
    });
    const locations = readObject(readObject(payload.data, "data").locations, "locations");
    return {
      locations: readEdges(locations).map((edge) => normalizeLocation(edge)),
      pageInfo: normalizePageInfo(readObject(locations.pageInfo, "pageInfo")),
    };
  },
  async get_location(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: getLocationQuery,
      variables: { id: input.id },
    });
    const location = readNullableObject(readObject(payload.data, "data").location, "location");
    return { location: location ? normalizeLocationDetail(location) : null };
  },
  async list_collections(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: listCollectionsQuery,
      variables: connectionVariables(input),
    });
    const collections = readObject(readObject(payload.data, "data").collections, "collections");
    return {
      collections: readEdges(collections).map((edge) => normalizeCollection(edge)),
      pageInfo: normalizePageInfo(readObject(collections.pageInfo, "pageInfo")),
    };
  },
  async get_collection(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: getCollectionQuery,
      variables: { id: input.id },
    });
    const collection = readNullableObject(readObject(payload.data, "data").collection, "collection");
    return { collection: collection ? normalizeCollectionDetail(collection) : null };
  },
  async execute_graphql(input, context) {
    const payload = await requestShopifyAdminGraphQL(context, {
      query: requiredString(input.query, "query", providerInputError),
      variables: optionalRecord(input.variables),
    });
    const data = readObject(payload.data, "data");
    const extensions = optionalRecord(payload.extensions);
    return compactObject({ data, extensions });
  },
};

export async function validateShopifyAdminCredential(
  apiKey: string,
  shopDomainValue: string | undefined,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string; grantedScopes: string[] };
  metadata: Record<string, unknown>;
}> {
  const shopDomain = normalizeShopDomain(shopDomainValue);
  const payload = await requestShopifyAdminGraphQL(
    {
      apiKey,
      shopDomain,
      fetcher,
      signal,
    },
    {
      query: currentShopQuery,
    },
  );
  const shop = normalizeShop(readObject(readObject(payload.data, "data").shop, "shop"));

  return {
    profile: {
      accountId: `shopify_admin:${shopDomain}`,
      displayName: shop.name,
      grantedScopes: [],
    },
    metadata: {
      shopDomain,
      apiBaseUrl: buildShopifyAdminApiBaseUrl(shopDomain),
      graphQLEndpoint: `/admin/api/${shopifyAdminApiVersion}/graphql.json`,
      credentialHelpUrl,
      shopId: shop.id,
      myshopifyDomain: shop.myshopifyDomain,
    },
  };
}

export function normalizeShopDomain(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "shopDomain is required");
  }

  let host = trimmed;
  if (trimmed.includes("://")) {
    try {
      host = new URL(trimmed).hostname;
    } catch {
      throw new ProviderRequestError(400, "shopDomain must be a myshopify.com domain or URL");
    }
  } else {
    host = trimmed.split("/")[0] ?? "";
  }

  const normalized = host.toLowerCase();
  if (!isMyshopifyDomain(normalized)) {
    throw new ProviderRequestError(400, "shopDomain must be a myshopify.com domain or URL");
  }
  return normalized;
}

export function buildShopifyAdminApiBaseUrl(shopDomain: string): string {
  return `https://${shopDomain}/admin/api/${shopifyAdminApiVersion}`;
}

function buildShopifyAdminGraphQLUrl(shopDomain: string): string {
  return `${buildShopifyAdminApiBaseUrl(shopDomain)}/graphql.json`;
}

async function requestShopifyAdminGraphQL(
  context: ShopifyAdminActionContext,
  request: ShopifyAdminGraphQLRequest,
): Promise<ShopifyAdminGraphQLResponse> {
  const response = await context.fetcher(buildShopifyAdminGraphQLUrl(context.shopDomain), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
      "x-shopify-access-token": context.apiKey,
    },
    body: JSON.stringify(compactObject({ query: request.query, variables: request.variables })),
    signal: context.signal,
  });
  const payload = await readShopifyAdminJson(response, { allowInvalidJson: !response.ok });
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status,
      `shopify_admin GraphQL request failed with HTTP ${response.status}`,
      payload,
    );
  }

  const errors = readGraphQLErrors(payload.errors);
  if (errors.length > 0) {
    throw new ProviderRequestError(502, `shopify_admin GraphQL error: ${errors.join("; ")}`, payload.errors);
  }
  return payload;
}

async function readShopifyAdminJson(
  response: Response,
  options: { allowInvalidJson?: boolean } = {},
): Promise<ShopifyAdminGraphQLResponse> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as ShopifyAdminGraphQLResponse;
  } catch {
    if (options.allowInvalidJson) {
      return {};
    }
    throw new ProviderRequestError(502, "shopify_admin returned invalid JSON");
  }
}

function readGraphQLErrors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalString(optionalRecord(item)?.message) ?? "unknown GraphQL error");
}

function connectionVariables(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    first: optionalInteger(input.first),
    after: optionalString(input.after),
    query: optionalString(input.query),
  });
}

function locationConnectionVariables(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ...connectionVariables(input),
    includeInactive: optionalBoolean(input.includeInactive),
    includeLegacy: optionalBoolean(input.includeLegacy),
  });
}

function normalizeShop(raw: Record<string, unknown>): ShopifyAdminShop {
  const primaryDomain = optionalRecord(raw.primaryDomain);
  return {
    id: readRequiredString(raw, "id"),
    name: readRequiredString(raw, "name"),
    myshopifyDomain: readRequiredString(raw, "myshopifyDomain"),
    primaryDomainUrl: optionalString(primaryDomain?.url) ?? null,
    primaryDomainHost: optionalString(primaryDomain?.host) ?? null,
    raw,
  };
}

function normalizeProductSummary(edge: Record<string, unknown>): Record<string, unknown> {
  const product = readObject(edge.node, "node");
  return {
    id: readRequiredString(product, "id"),
    title: readRequiredString(product, "title"),
    handle: optionalString(product.handle) ?? null,
    status: optionalString(product.status) ?? null,
    vendor: optionalString(product.vendor) ?? null,
    productType: optionalString(product.productType) ?? null,
    createdAt: optionalString(product.createdAt) ?? null,
    updatedAt: optionalString(product.updatedAt) ?? null,
    onlineStoreUrl: optionalString(product.onlineStoreUrl) ?? null,
    cursor: optionalString(edge.cursor) ?? null,
    raw: product,
  };
}

function normalizeProductDetail(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredString(raw, "id"),
    title: readRequiredString(raw, "title"),
    handle: optionalString(raw.handle) ?? null,
    status: optionalString(raw.status) ?? null,
    vendor: optionalString(raw.vendor) ?? null,
    productType: optionalString(raw.productType) ?? null,
    descriptionHtml: optionalString(raw.descriptionHtml) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    onlineStoreUrl: optionalString(raw.onlineStoreUrl) ?? null,
    raw,
  };
}

function normalizeVariant(edge: Record<string, unknown>): Record<string, unknown> {
  const variant = readObject(edge.node, "node");
  const product = optionalRecord(variant.product);
  return {
    id: readRequiredString(variant, "id"),
    title: readRequiredString(variant, "title"),
    sku: optionalString(variant.sku) ?? null,
    price: optionalString(variant.price) ?? null,
    inventoryQuantity: optionalInteger(variant.inventoryQuantity) ?? null,
    productId: optionalString(product?.id) ?? null,
    productTitle: optionalString(product?.title) ?? null,
    cursor: optionalString(edge.cursor) ?? null,
    raw: variant,
  };
}

function normalizeOrder(edge: Record<string, unknown>): Record<string, unknown> {
  const order = readObject(edge.node, "node");
  return {
    ...normalizeOrderDetail(order),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeOrderDetail(raw: Record<string, unknown>): Record<string, unknown> {
  const customer = optionalRecord(raw.customer);
  const totalMoney = readShopMoney(raw.currentTotalPriceSet);
  return {
    id: readRequiredString(raw, "id"),
    name: readRequiredString(raw, "name"),
    email: optionalString(raw.email) ?? null,
    phone: optionalString(raw.phone) ?? null,
    displayFinancialStatus: optionalString(raw.displayFinancialStatus) ?? null,
    displayFulfillmentStatus: optionalString(raw.displayFulfillmentStatus) ?? null,
    currencyCode: optionalString(raw.currencyCode) ?? null,
    totalAmount: totalMoney.amount,
    totalCurrencyCode: totalMoney.currencyCode,
    customerId: optionalString(customer?.id) ?? null,
    customerDisplayName: optionalString(customer?.displayName) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    raw,
  };
}

function normalizeCustomer(edge: Record<string, unknown>): Record<string, unknown> {
  const customer = readObject(edge.node, "node");
  return {
    ...normalizeCustomerDetail(customer),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeCustomerDetail(raw: Record<string, unknown>): Record<string, unknown> {
  const amountSpent = optionalRecord(raw.amountSpent);
  const defaultEmailAddress = optionalRecord(raw.defaultEmailAddress);
  const defaultPhoneNumber = optionalRecord(raw.defaultPhoneNumber);
  return {
    id: readRequiredString(raw, "id"),
    displayName: readRequiredString(raw, "displayName"),
    firstName: optionalString(raw.firstName) ?? null,
    lastName: optionalString(raw.lastName) ?? null,
    email: optionalString(defaultEmailAddress?.emailAddress) ?? null,
    phone: optionalString(defaultPhoneNumber?.phoneNumber) ?? null,
    state: optionalString(raw.state) ?? null,
    tags: readStringArray(raw.tags),
    numberOfOrders: optionalString(raw.numberOfOrders) ?? null,
    amountSpent: optionalString(amountSpent?.amount) ?? null,
    amountSpentCurrencyCode: optionalString(amountSpent?.currencyCode) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    raw,
  };
}

function normalizeInventoryItem(edge: Record<string, unknown>): Record<string, unknown> {
  const inventoryItem = readObject(edge.node, "node");
  return {
    ...normalizeInventoryItemDetail(inventoryItem),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeInventoryItemDetail(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredString(raw, "id"),
    sku: optionalString(raw.sku) ?? null,
    tracked: readRequiredBoolean(raw, "tracked"),
    requiresShipping: readRequiredBoolean(raw, "requiresShipping"),
    countryCodeOfOrigin: optionalString(raw.countryCodeOfOrigin) ?? null,
    harmonizedSystemCode: optionalString(raw.harmonizedSystemCode) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    raw,
  };
}

function normalizeLocation(edge: Record<string, unknown>): Record<string, unknown> {
  const location = readObject(edge.node, "node");
  return {
    ...normalizeLocationDetail(location),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeLocationDetail(raw: Record<string, unknown>): Record<string, unknown> {
  const address = optionalRecord(raw.address);
  return {
    id: readRequiredString(raw, "id"),
    name: readRequiredString(raw, "name"),
    isActive: readRequiredBoolean(raw, "isActive"),
    fulfillsOnlineOrders: readRequiredBoolean(raw, "fulfillsOnlineOrders"),
    address1: optionalString(address?.address1) ?? null,
    city: optionalString(address?.city) ?? null,
    province: optionalString(address?.province) ?? null,
    country: optionalString(address?.country) ?? null,
    zip: optionalString(address?.zip) ?? null,
    raw,
  };
}

function normalizeCollection(edge: Record<string, unknown>): Record<string, unknown> {
  const collection = readObject(edge.node, "node");
  return {
    ...normalizeCollectionDetail(collection),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeCollectionDetail(raw: Record<string, unknown>): Record<string, unknown> {
  const image = optionalRecord(raw.image);
  return {
    id: readRequiredString(raw, "id"),
    title: readRequiredString(raw, "title"),
    handle: readRequiredString(raw, "handle"),
    description: readRequiredString(raw, "description"),
    descriptionHtml: readRequiredString(raw, "descriptionHtml"),
    updatedAt: optionalString(raw.updatedAt) ?? null,
    imageUrl: optionalString(image?.url) ?? null,
    raw,
  };
}

function readShopMoney(value: unknown): { amount: string | null; currencyCode: string | null } {
  const money = optionalRecord(optionalRecord(value)?.shopMoney);
  return {
    amount: optionalString(money?.amount) ?? null,
    currencyCode: optionalString(money?.currencyCode) ?? null,
  };
}

function normalizePageInfo(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    hasNextPage: readRequiredBoolean(raw, "hasNextPage"),
    hasPreviousPage: readRequiredBoolean(raw, "hasPreviousPage"),
    startCursor: optionalString(raw.startCursor) ?? null,
    endCursor: optionalString(raw.endCursor) ?? null,
  };
}

function readEdges(connection: Record<string, unknown>): Array<Record<string, unknown>> {
  const edges = connection.edges;
  if (!Array.isArray(edges)) {
    throw new ProviderRequestError(502, "shopify_admin response is missing edges");
  }
  return edges.map((edge) => readObject(edge, "edge"));
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  try {
    return requiredRecord(value, fieldName);
  } catch {
    throw new ProviderRequestError(502, `shopify_admin response is missing ${fieldName}`);
  }
}

function readNullableObject(value: unknown, fieldName: string): Record<string, unknown> | null {
  return value === null ? null : readObject(value, fieldName);
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(
    input[key],
    key,
    () => new ProviderRequestError(502, `shopify_admin response is missing ${key}`),
  );
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readRequiredBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `shopify_admin response is missing ${key}`);
  }
  return value;
}

function isMyshopifyDomain(host: string): boolean {
  if (!host.endsWith(".myshopify.com") || host.length <= ".myshopify.com".length) {
    return false;
  }
  return host
    .slice(0, -".myshopify.com".length)
    .split(".")
    .every((segment) => isDnsLabel(segment));
}

function isDnsLabel(value: string): boolean {
  if (!value || value.startsWith("-") || value.endsWith("-") || value.length > 63) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (!isDigit && !isLowercaseLetter && char !== "-") {
      return false;
    }
  }
  return true;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
