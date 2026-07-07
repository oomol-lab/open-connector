import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ShopifyStorefrontActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "shopify_storefront";
const shopifyStorefrontApiVersion = "2026-04";
const credentialHelpUrl =
  "https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/getting-started";

interface ShopifyStorefrontActionContext {
  apiKey: string;
  shopDomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ShopifyStorefrontGraphQLResponse {
  data?: unknown;
  errors?: unknown;
}

interface ShopifyStorefrontGraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

type ShopifyStorefrontActionHandler = (
  input: Record<string, unknown>,
  context: ShopifyStorefrontActionContext,
) => Promise<unknown>;

const currentShopQuery = `query ShopifyStorefrontCurrentShop {
  shop {
    id
    name
    description
    moneyFormat
    primaryDomain {
      url
    }
  }
}`;

const listProductsQuery = `query ShopifyStorefrontListProducts($first: Int, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        handle
        description
        vendor
        productType
        onlineStoreUrl
        featuredImage {
          url
          altText
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
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

const productDetailFragment = `fragment ShopifyStorefrontProductDetail on Product {
  id
  title
  handle
  description
  descriptionHtml
  vendor
  productType
  onlineStoreUrl
  featuredImage {
    url
    altText
  }
  priceRange {
    minVariantPrice {
      amount
      currencyCode
    }
    maxVariantPrice {
      amount
      currencyCode
    }
  }
}`;

const getProductByIdQuery = `query ShopifyStorefrontGetProductById($id: ID!) {
  product(id: $id) {
    ...ShopifyStorefrontProductDetail
  }
}

${productDetailFragment}`;

const getProductByHandleQuery = `query ShopifyStorefrontGetProductByHandle($handle: String!) {
  product(handle: $handle) {
    ...ShopifyStorefrontProductDetail
  }
}

${productDetailFragment}`;

const listCollectionsQuery = `query ShopifyStorefrontListCollections($first: Int, $after: String, $query: String) {
  collections(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        handle
        description
        onlineStoreUrl
        image {
          url
          altText
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

const collectionDetailFragment = `fragment ShopifyStorefrontCollectionDetail on Collection {
  id
  title
  handle
  description
  descriptionHtml
  onlineStoreUrl
  image {
    url
    altText
  }
}`;

const getCollectionByIdQuery = `query ShopifyStorefrontGetCollectionById($id: ID!) {
  collection(id: $id) {
    ...ShopifyStorefrontCollectionDetail
  }
}

${collectionDetailFragment}`;

const getCollectionByHandleQuery = `query ShopifyStorefrontGetCollectionByHandle($handle: String!) {
  collection(handle: $handle) {
    ...ShopifyStorefrontCollectionDetail
  }
}

${collectionDetailFragment}`;

const cartFieldsFragment = `fragment ShopifyStorefrontCartFields on Cart {
  id
  checkoutUrl
  createdAt
  updatedAt
  totalQuantity
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    edges {
      cursor
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            title
            sku
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

const createCartMutation = `mutation ShopifyStorefrontCreateCart($input: CartInput!) {
  cartCreate(input: $input) {
    cart {
      ...ShopifyStorefrontCartFields
    }
    userErrors {
      field
      message
    }
  }
}

${cartFieldsFragment}`;

const getCartQuery = `query ShopifyStorefrontGetCart($cartId: ID!) {
  cart(id: $cartId) {
    ...ShopifyStorefrontCartFields
  }
}

${cartFieldsFragment}`;

const addCartLinesMutation = `mutation ShopifyStorefrontAddCartLines($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart {
      ...ShopifyStorefrontCartFields
    }
    userErrors {
      field
      message
    }
  }
}

${cartFieldsFragment}`;

export const shopifyStorefrontActionHandlers: Record<ShopifyStorefrontActionName, ShopifyStorefrontActionHandler> = {
  async get_shop(_input, context) {
    const payload = await requestShopifyStorefrontGraphQL(context, { query: currentShopQuery });
    return {
      shop: normalizeShop(readObject(readObject(payload.data, "data").shop, "shop")),
    };
  },
  async list_products(input, context) {
    const payload = await requestShopifyStorefrontGraphQL(context, {
      query: listProductsQuery,
      variables: connectionVariables(input),
    });
    const products = readConnection(readObject(payload.data, "data").products, "products");
    return {
      products: products.edges.map(normalizeProductSummary),
      pageInfo: products.pageInfo,
    };
  },
  async get_product(input, context) {
    const { query, variables } = idOrHandleQuery(input, {
      byId: getProductByIdQuery,
      byHandle: getProductByHandleQuery,
      resource: "product",
    });
    const payload = await requestShopifyStorefrontGraphQL(context, { query, variables });
    const product = optionalRecord(readObject(payload.data, "data").product);
    return {
      product: product ? normalizeProductDetail(product) : null,
    };
  },
  async list_collections(input, context) {
    const payload = await requestShopifyStorefrontGraphQL(context, {
      query: listCollectionsQuery,
      variables: connectionVariables(input),
    });
    const collections = readConnection(readObject(payload.data, "data").collections, "collections");
    return {
      collections: collections.edges.map(normalizeCollectionSummary),
      pageInfo: collections.pageInfo,
    };
  },
  async get_collection(input, context) {
    const { query, variables } = idOrHandleQuery(input, {
      byId: getCollectionByIdQuery,
      byHandle: getCollectionByHandleQuery,
      resource: "collection",
    });
    const payload = await requestShopifyStorefrontGraphQL(context, { query, variables });
    const collection = optionalRecord(readObject(payload.data, "data").collection);
    return {
      collection: collection ? normalizeCollectionDetail(collection) : null,
    };
  },
  async create_cart(input, context) {
    const payload = await requestShopifyStorefrontGraphQL(context, {
      query: createCartMutation,
      variables: {
        input: compactObject({
          lines: input.lines,
          buyerIdentity: input.buyerIdentity,
          attributes: input.attributes,
        }),
      },
    });
    const result = readObject(readObject(payload.data, "data").cartCreate, "cartCreate");
    return {
      cart: normalizeOptionalCart(result.cart),
      userErrors: normalizeUserErrors(result.userErrors),
    };
  },
  async get_cart(input, context) {
    const payload = await requestShopifyStorefrontGraphQL(context, {
      query: getCartQuery,
      variables: { cartId: input.cartId },
    });
    return {
      cart: normalizeOptionalCart(readObject(payload.data, "data").cart),
    };
  },
  async add_cart_lines(input, context) {
    const payload = await requestShopifyStorefrontGraphQL(context, {
      query: addCartLinesMutation,
      variables: {
        cartId: input.cartId,
        lines: input.lines,
      },
    });
    const result = readObject(readObject(payload.data, "data").cartLinesAdd, "cartLinesAdd");
    return {
      cart: normalizeOptionalCart(result.cart),
      userErrors: normalizeUserErrors(result.userErrors),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ShopifyStorefrontActionContext>({
  service,
  handlers: shopifyStorefrontActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ShopifyStorefrontActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      shopDomain: normalizeShopDomain(optionalString(credential.values.shopDomain)),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "shopify_storefront request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildShopifyStorefrontApiBaseUrl(normalizeShopDomain(optionalString(credential.values.shopDomain)));
  },
  auth: { type: "api_key_header", name: "x-shopify-storefront-access-token" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const shopDomain = normalizeShopDomain(optionalString(input.values.shopDomain));
    const payload = await requestShopifyStorefrontGraphQL(
      { apiKey: input.apiKey, shopDomain, fetcher, signal },
      { query: currentShopQuery },
    );
    const shop = normalizeShop(readObject(readObject(payload.data, "data").shop, "shop"));
    return {
      profile: {
        accountId: `shopify_storefront:${shopDomain}`,
        displayName: shop.name,
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        shopDomain,
        apiBaseUrl: buildShopifyStorefrontApiBaseUrl(shopDomain),
        graphQLEndpoint: `/api/${shopifyStorefrontApiVersion}/graphql.json`,
        credentialHelpUrl,
        shopId: shop.id,
        primaryDomainUrl: shop.primaryDomainUrl,
      },
    };
  },
};

function buildShopifyStorefrontApiBaseUrl(shopDomain: string): string {
  return `https://${shopDomain}/api/${shopifyStorefrontApiVersion}`;
}

function buildShopifyStorefrontGraphQLUrl(shopDomain: string): string {
  return `${buildShopifyStorefrontApiBaseUrl(shopDomain)}/graphql.json`;
}

function normalizeShopDomain(value: string | undefined): string {
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

async function requestShopifyStorefrontGraphQL(
  context: ShopifyStorefrontActionContext,
  request: ShopifyStorefrontGraphQLRequest,
): Promise<ShopifyStorefrontGraphQLResponse> {
  let response: Response;
  try {
    response = await context.fetcher(buildShopifyStorefrontGraphQLUrl(context.shopDomain), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-shopify-storefront-access-token": context.apiKey,
      },
      body: JSON.stringify(compactObject({ query: request.query, variables: request.variables })),
      signal: context.signal,
    });
  } catch {
    throw new ProviderRequestError(504, "shopify_storefront GraphQL request failed before receiving response");
  }

  const payload = await readShopifyStorefrontJson(response, { allowInvalidJson: !response.ok });
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status,
      `shopify_storefront GraphQL request failed with HTTP ${response.status}`,
      payload,
    );
  }
  const errors = readGraphQLErrors(payload.errors);
  if (errors.length > 0) {
    throw new ProviderRequestError(502, `shopify_storefront GraphQL error: ${errors.join("; ")}`, payload.errors);
  }
  return payload;
}

async function readShopifyStorefrontJson(
  response: Response,
  options: { allowInvalidJson?: boolean } = {},
): Promise<ShopifyStorefrontGraphQLResponse> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as ShopifyStorefrontGraphQLResponse;
  } catch {
    if (options.allowInvalidJson) {
      return {};
    }
    throw new ProviderRequestError(502, "shopify_storefront returned invalid JSON");
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
    first: typeof input.first === "number" ? input.first : undefined,
    after: typeof input.after === "string" ? input.after : undefined,
    query: typeof input.query === "string" ? input.query : undefined,
  });
}

function idOrHandleQuery(
  input: Record<string, unknown>,
  options: { byId: string; byHandle: string; resource: string },
): { query: string; variables: Record<string, string> } {
  if (typeof input.id === "string") {
    return { query: options.byId, variables: { id: input.id } };
  }
  if (typeof input.handle === "string") {
    return { query: options.byHandle, variables: { handle: input.handle } };
  }
  throw new ProviderRequestError(400, `${options.resource} id or handle is required`);
}

interface ShopifyStorefrontShop {
  id: string | null;
  name: string;
  description: string | null;
  moneyFormat: string | null;
  primaryDomainUrl: string | null;
  raw: Record<string, unknown>;
}

function normalizeShop(raw: Record<string, unknown>): ShopifyStorefrontShop {
  return {
    id: optionalString(raw.id) ?? null,
    name: readRequiredString(raw, "name"),
    description: optionalString(raw.description) ?? null,
    moneyFormat: optionalString(raw.moneyFormat) ?? null,
    primaryDomainUrl: optionalString(optionalRecord(raw.primaryDomain)?.url) ?? null,
    raw,
  };
}

function normalizeProductSummary(edge: Record<string, unknown>): Record<string, unknown> {
  const product = readObject(edge.node, "node");
  return { ...normalizeProductBase(product), cursor: optionalString(edge.cursor) ?? null };
}

function normalizeProductDetail(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...normalizeProductBase(raw), descriptionHtml: optionalString(raw.descriptionHtml) ?? null };
}

function normalizeProductBase(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredString(raw, "id"),
    title: readRequiredString(raw, "title"),
    handle: readRequiredString(raw, "handle"),
    description: optionalString(raw.description) ?? null,
    vendor: optionalString(raw.vendor) ?? null,
    productType: optionalString(raw.productType) ?? null,
    onlineStoreUrl: optionalString(raw.onlineStoreUrl) ?? null,
    featuredImage: normalizeOptionalImage(raw.featuredImage),
    priceRange: normalizePriceRange(readObject(raw.priceRange, "priceRange")),
    raw,
  };
}

function normalizeCollectionSummary(edge: Record<string, unknown>): Record<string, unknown> {
  const collection = readObject(edge.node, "node");
  return { ...normalizeCollectionBase(collection), cursor: optionalString(edge.cursor) ?? null };
}

function normalizeCollectionDetail(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...normalizeCollectionBase(raw), descriptionHtml: optionalString(raw.descriptionHtml) ?? null };
}

function normalizeCollectionBase(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredString(raw, "id"),
    title: readRequiredString(raw, "title"),
    handle: readRequiredString(raw, "handle"),
    description: optionalString(raw.description) ?? null,
    onlineStoreUrl: optionalString(raw.onlineStoreUrl) ?? null,
    image: normalizeOptionalImage(raw.image),
    raw,
  };
}

function normalizeOptionalCart(value: unknown): Record<string, unknown> | null {
  const cart = optionalRecord(value);
  return cart ? normalizeCart(cart) : null;
}

function normalizeCart(raw: Record<string, unknown>): Record<string, unknown> {
  const cost = optionalRecord(raw.cost);
  const lines = readConnection(readObject(raw.lines, "lines"), "lines");
  return {
    id: readRequiredString(raw, "id"),
    checkoutUrl: readRequiredString(raw, "checkoutUrl"),
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    totalQuantity: readRequiredInteger(raw, "totalQuantity"),
    subtotalAmount: normalizeOptionalMoney(cost?.subtotalAmount),
    totalAmount: normalizeOptionalMoney(cost?.totalAmount),
    lines: lines.edges.map(normalizeCartLine),
    raw,
  };
}

function normalizeCartLine(edge: Record<string, unknown>): Record<string, unknown> {
  const line = readObject(edge.node, "node");
  const merchandise = optionalRecord(line.merchandise);
  return {
    id: readRequiredString(line, "id"),
    quantity: readRequiredInteger(line, "quantity"),
    merchandiseId: readRequiredString(merchandise ?? {}, "id"),
    merchandiseTitle: optionalString(merchandise?.title) ?? null,
    merchandiseSku: optionalString(merchandise?.sku) ?? null,
    cursor: optionalString(edge.cursor) ?? null,
    raw: line,
  };
}

function normalizeOptionalImage(value: unknown): Record<string, unknown> | null {
  const image = optionalRecord(value);
  if (!image) {
    return null;
  }
  return {
    url: readRequiredString(image, "url"),
    altText: optionalString(image.altText) ?? null,
  };
}

function normalizePriceRange(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    minVariantPrice: normalizeMoney(readObject(raw.minVariantPrice, "minVariantPrice")),
    maxVariantPrice: normalizeMoney(readObject(raw.maxVariantPrice, "maxVariantPrice")),
  };
}

function normalizeOptionalMoney(value: unknown): Record<string, unknown> | null {
  const money = optionalRecord(value);
  return money ? normalizeMoney(money) : null;
}

function normalizeMoney(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    amount: readRequiredString(raw, "amount"),
    currencyCode: readRequiredString(raw, "currencyCode"),
  };
}

function normalizeUserErrors(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const error = readObject(item, "userError");
    return {
      field: Array.isArray(error.field) ? error.field.map(String) : [],
      message: readRequiredString(error, "message"),
    };
  });
}

function readConnection(
  value: unknown,
  key: string,
): {
  edges: Array<Record<string, unknown>>;
  pageInfo: Record<string, unknown>;
} {
  const connection = readObject(value, key);
  const edgesRaw = connection.edges;
  const pageInfo = readObject(connection.pageInfo, "pageInfo");
  if (!Array.isArray(edgesRaw)) {
    throw new ProviderRequestError(502, `shopify_storefront ${key} edges are invalid`, value);
  }
  return {
    edges: edgesRaw.map((edge) => readObject(edge, "edge")),
    pageInfo: {
      hasNextPage: readRequiredBoolean(pageInfo, "hasNextPage"),
      hasPreviousPage: readRequiredBoolean(pageInfo, "hasPreviousPage"),
      startCursor: optionalString(pageInfo.startCursor) ?? null,
      endCursor: optionalString(pageInfo.endCursor) ?? null,
    },
  };
}

function readObject(value: unknown, key: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `shopify_storefront ${key} is invalid`, value);
  }
  return record;
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  if (typeof input[key] !== "string") {
    throw new ProviderRequestError(502, `shopify_storefront ${key} is invalid`, input);
  }
  return input[key];
}

function readRequiredInteger(input: Record<string, unknown>, key: string): number {
  if (!Number.isInteger(input[key])) {
    throw new ProviderRequestError(502, `shopify_storefront ${key} is invalid`, input);
  }
  return input[key] as number;
}

function readRequiredBoolean(input: Record<string, unknown>, key: string): boolean {
  if (typeof input[key] !== "boolean") {
    throw new ProviderRequestError(502, `shopify_storefront ${key} is invalid`, input);
  }
  return input[key];
}
