import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shopify_storefront";
const defineShopifyStorefrontAction = <TName extends ShopifyStorefrontActionName>(
  input: Parameters<typeof defineProviderAction<TName>>[1],
): ProviderActionDefinition<TName> => defineProviderAction(service, input);

const gidSchema = s.nonEmptyString("A Shopify GraphQL global ID.");
const cursorSchema = s.nonEmptyString("A Shopify GraphQL pagination cursor.");
const rawObjectSchema = s.looseObject("The raw object returned by Shopify Storefront GraphQL.");
const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const firstWithDefaultSchema = s.integer({
  description: "The first number of records to return.",
  minimum: 1,
  maximum: 250,
  default: 50,
});

const pageInfoSchema = s.object("Shopify GraphQL pagination metadata.", {
  hasNextPage: s.boolean("Whether another page exists after this page."),
  hasPreviousPage: s.boolean("Whether another page exists before this page."),
  startCursor: s.nullable(cursorSchema),
  endCursor: s.nullable(cursorSchema),
});
const imageSchema = s.object("A normalized Shopify image.", {
  url: s.url("The image URL."),
  altText: nullableStringSchema("The image alt text when returned by Shopify."),
});
const moneySchema = s.object("A Shopify money amount.", {
  amount: s.string("The decimal amount encoded as a string."),
  currencyCode: s.string("The ISO currency code."),
});
const priceRangeSchema = s.object("A Shopify product price range.", {
  minVariantPrice: moneySchema,
  maxVariantPrice: moneySchema,
});
const shopSchema = s.object("A normalized Shopify Storefront shop.", {
  id: nullableStringSchema("The shop ID when returned by Shopify."),
  name: s.string("The shop display name."),
  description: nullableStringSchema("The shop description when returned by Shopify."),
  moneyFormat: nullableStringSchema("The shop money format when returned by Shopify."),
  primaryDomainUrl: s.nullable(s.url("The shop primary domain URL when returned by Shopify.")),
  raw: rawObjectSchema,
});
const productSummarySchema = s.object("A normalized Shopify Storefront product summary.", {
  id: gidSchema,
  title: s.string("The product title."),
  handle: s.string("The product handle."),
  description: nullableStringSchema("The plain-text product description when returned."),
  vendor: nullableStringSchema("The product vendor when returned by Shopify."),
  productType: nullableStringSchema("The product type when returned by Shopify."),
  onlineStoreUrl: s.nullable(s.url("The online store product URL when returned by Shopify.")),
  featuredImage: s.nullable(imageSchema),
  priceRange: priceRangeSchema,
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const productDetailSchema = s.object("A normalized Shopify Storefront product detail.", {
  id: gidSchema,
  title: s.string("The product title."),
  handle: s.string("The product handle."),
  description: nullableStringSchema("The plain-text product description when returned."),
  descriptionHtml: nullableStringSchema("The product HTML description when returned."),
  vendor: nullableStringSchema("The product vendor when returned by Shopify."),
  productType: nullableStringSchema("The product type when returned by Shopify."),
  onlineStoreUrl: s.nullable(s.url("The online store product URL when returned by Shopify.")),
  featuredImage: s.nullable(imageSchema),
  priceRange: priceRangeSchema,
  raw: rawObjectSchema,
});
const collectionSummarySchema = s.object("A normalized Shopify Storefront collection summary.", {
  id: gidSchema,
  title: s.string("The collection title."),
  handle: s.string("The collection handle."),
  description: nullableStringSchema("The plain-text collection description when returned."),
  onlineStoreUrl: s.nullable(s.url("The online store collection URL when returned by Shopify.")),
  image: s.nullable(imageSchema),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const collectionDetailSchema = s.object("A normalized Shopify Storefront collection detail.", {
  id: gidSchema,
  title: s.string("The collection title."),
  handle: s.string("The collection handle."),
  description: nullableStringSchema("The plain-text collection description when returned."),
  descriptionHtml: nullableStringSchema("The collection HTML description when returned."),
  onlineStoreUrl: s.nullable(s.url("The online store collection URL when returned by Shopify.")),
  image: s.nullable(imageSchema),
  raw: rawObjectSchema,
});
const attributeSchema = s.object("A Shopify key-value attribute.", {
  key: s.nonEmptyString("The attribute key."),
  value: s.string("The attribute value."),
});
const cartLineInputSchema = s.object(
  "A cart line to add to a Shopify cart.",
  {
    merchandiseId: gidSchema,
    quantity: s.integer("The quantity for this cart line.", { minimum: 1 }),
    attributes: s.array("Custom attributes to attach to this cart line.", attributeSchema),
  },
  { optional: ["attributes"] },
);
const cartLineSchema = s.object("A normalized Shopify cart line.", {
  id: gidSchema,
  quantity: s.integer("The cart line quantity.", { minimum: 0 }),
  merchandiseId: gidSchema,
  merchandiseTitle: nullableStringSchema("The merchandise title when returned by Shopify."),
  merchandiseSku: nullableStringSchema("The merchandise SKU when returned by Shopify."),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const cartSchema = s.object("A normalized Shopify cart.", {
  id: gidSchema,
  checkoutUrl: s.url("The URL where the customer can complete checkout."),
  createdAt: nullableStringSchema("The cart creation timestamp when returned by Shopify."),
  updatedAt: nullableStringSchema("The cart update timestamp when returned by Shopify."),
  totalQuantity: s.integer("The total quantity of all cart lines.", { minimum: 0 }),
  subtotalAmount: s.nullable(moneySchema),
  totalAmount: s.nullable(moneySchema),
  lines: s.array("Cart lines returned by Shopify.", cartLineSchema),
  raw: rawObjectSchema,
});
const userErrorSchema = s.object("A Shopify Storefront user error.", {
  field: s.array("The input path for this error.", s.string("A field path segment.")),
  message: s.string("The user error message."),
});

export type ShopifyStorefrontActionName =
  | "get_shop"
  | "list_products"
  | "get_product"
  | "list_collections"
  | "get_collection"
  | "create_cart"
  | "get_cart"
  | "add_cart_lines";

export const shopifyStorefrontActions: ActionDefinition[] = [
  defineShopifyStorefrontAction({
    name: "get_shop",
    operationType: "read",
    description: "Get public shop metadata from Shopify Storefront.",
    inputSchema: s.object("No input is required to fetch the shop metadata.", {}),
    outputSchema: s.object("The Shopify Storefront shop metadata result.", { shop: shopSchema }),
  }),
  defineShopifyStorefrontAction({
    name: "list_products",
    operationType: "read",
    description: "List products visible to the Shopify Storefront API.",
    inputSchema: s.object(
      "Pagination input for listing Shopify Storefront products.",
      {
        first: firstWithDefaultSchema,
        after: cursorSchema,
        query: s.nonEmptyString("A Shopify Storefront product search query string."),
      },
      { optional: ["first", "after", "query"] },
    ),
    outputSchema: s.object("The Shopify Storefront product list result.", {
      products: s.array("Products returned by Shopify.", productSummarySchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineShopifyStorefrontAction({
    name: "get_product",
    operationType: "read",
    description: "Get one product by Storefront GraphQL ID or handle.",
    inputSchema: s.object(
      "Input for fetching one Shopify Storefront product.",
      {
        id: gidSchema,
        handle: s.nonEmptyString("The Shopify product handle."),
      },
      { optional: ["id", "handle"] },
    ),
    outputSchema: s.object("The Shopify Storefront product lookup result.", {
      product: s.nullable(productDetailSchema),
    }),
  }),
  defineShopifyStorefrontAction({
    name: "list_collections",
    operationType: "read",
    description: "List collections visible to the Shopify Storefront API.",
    inputSchema: s.object(
      "Pagination input for listing Shopify Storefront collections.",
      {
        first: firstWithDefaultSchema,
        after: cursorSchema,
        query: s.nonEmptyString("A Shopify Storefront collection search query string."),
      },
      { optional: ["first", "after", "query"] },
    ),
    outputSchema: s.object("The Shopify Storefront collection list result.", {
      collections: s.array("Collections returned by Shopify.", collectionSummarySchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineShopifyStorefrontAction({
    name: "get_collection",
    operationType: "read",
    description: "Get one collection by Storefront GraphQL ID or handle.",
    inputSchema: s.object(
      "Input for fetching one Shopify Storefront collection.",
      {
        id: gidSchema,
        handle: s.nonEmptyString("The Shopify collection handle."),
      },
      { optional: ["id", "handle"] },
    ),
    outputSchema: s.object("The Shopify Storefront collection lookup result.", {
      collection: s.nullable(collectionDetailSchema),
    }),
  }),
  defineShopifyStorefrontAction({
    name: "create_cart",
    operationType: "write",
    description: "Create a Shopify Storefront cart with optional initial lines.",
    inputSchema: s.object(
      "Input for creating a Shopify cart.",
      {
        lines: s.array("Initial cart lines.", cartLineInputSchema, { minItems: 1 }),
        buyerIdentity: s.looseObject("Optional Shopify cart buyer identity input."),
        attributes: s.array("Custom attributes to attach to the cart.", attributeSchema),
      },
      { optional: ["lines", "buyerIdentity", "attributes"] },
    ),
    outputSchema: s.object("The Shopify Storefront cart creation result.", {
      cart: s.nullable(cartSchema),
      userErrors: s.array("User errors returned by Shopify.", userErrorSchema),
    }),
  }),
  defineShopifyStorefrontAction({
    name: "get_cart",
    operationType: "read",
    description: "Get a Shopify Storefront cart by ID.",
    inputSchema: s.object("Input for fetching a Shopify cart.", { cartId: gidSchema }),
    outputSchema: s.object("The Shopify Storefront cart lookup result.", { cart: s.nullable(cartSchema) }),
  }),
  defineShopifyStorefrontAction({
    name: "add_cart_lines",
    operationType: "write",
    description: "Add merchandise lines to a Shopify Storefront cart.",
    inputSchema: s.object("Input for adding lines to a Shopify cart.", {
      cartId: gidSchema,
      lines: s.array("Cart lines to add.", cartLineInputSchema, { minItems: 1 }),
    }),
    outputSchema: s.object("The Shopify Storefront cart lines add result.", {
      cart: s.nullable(cartSchema),
      userErrors: s.array("User errors returned by Shopify.", userErrorSchema),
    }),
  }),
];
