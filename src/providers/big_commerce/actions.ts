import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "big_commerce";

const productIdSchema = s.integer("The BigCommerce product ID.", { minimum: 1 });
const priceSchema = s.number("The product price in the store currency.", { minimum: 0 });
const productTypeSchema = s.stringEnum("The BigCommerce product type.", ["physical", "digital"]);
const productIncludeSchema = s.stringEnum("Related product resources to include.", [
  "variants",
  "images",
  "custom_fields",
  "bulk_pricing_rules",
  "primary_image",
  "modifiers",
  "options",
  "videos",
]);
const productDirectionSchema = s.stringEnum("The sort direction for product list results.", ["asc", "desc"]);
const productSortSchema = s.stringEnum("The product field to sort by.", [
  "id",
  "name",
  "sku",
  "price",
  "date_created",
  "date_modified",
  "inventory_level",
  "is_visible",
]);
const inventoryTrackingSchema = s.stringEnum("The BigCommerce inventory tracking mode for the product.", [
  "none",
  "product",
  "variant",
]);
const productSchema = s.object("A normalized BigCommerce product.", {
  id: productIdSchema,
  name: s.string("The product name."),
  type: s.nullable(s.string("The product type returned by BigCommerce.")),
  sku: s.nullable(s.string("The product SKU when present.")),
  price: s.nullable(s.number("The product price in the store currency.")),
  inventoryLevel: s.nullable(s.integer("The product inventory level when returned.")),
  isVisible: s.nullable(s.boolean("Whether the product is visible in the storefront.")),
  customUrl: s.nullable(s.string("The product custom URL path when returned.")),
  raw: s.looseObject("The raw product object returned by BigCommerce."),
});
const paginationSchema = s.object("BigCommerce pagination metadata.", {
  total: s.nullable(s.integer("The total number of matching products.")),
  count: s.nullable(s.integer("The number of products returned in this page.")),
  perPage: s.nullable(s.integer("The requested page size.")),
  currentPage: s.nullable(s.integer("The current page number.")),
  totalPages: s.nullable(s.integer("The total number of pages.")),
});
const productListInputSchema = s.object(
  "Query parameters for listing BigCommerce catalog products.",
  {
    page: s.integer("The product page number to request.", { minimum: 1 }),
    limit: s.integer("The maximum number of products to return.", { minimum: 1, maximum: 250 }),
    keyword: s.string("Search products by keyword.", { minLength: 1 }),
    name: s.string("Filter products by name.", { minLength: 1 }),
    sku: s.string("Filter products by SKU.", { minLength: 1 }),
    isVisible: s.boolean("Filter products by storefront visibility."),
    include: s.array("Related product resources to include.", productIncludeSchema, {
      minItems: 1,
    }),
    includeFields: s.array("Product fields to include in the response.", s.string("A product field name."), {
      minItems: 1,
    }),
    excludeFields: s.array("Product fields to exclude from the response.", s.string("A product field name."), {
      minItems: 1,
    }),
    sort: productSortSchema,
    direction: productDirectionSchema,
  },
  {
    optional: [
      "page",
      "limit",
      "keyword",
      "name",
      "sku",
      "isVisible",
      "include",
      "includeFields",
      "excludeFields",
      "sort",
      "direction",
    ],
  },
);
const productReadInputSchema = s.object(
  "Path and query parameters for retrieving a BigCommerce product.",
  {
    productId: productIdSchema,
    include: s.array("Related product resources to include.", productIncludeSchema, {
      minItems: 1,
    }),
    includeFields: s.array("Product fields to include in the response.", s.string("A product field name."), {
      minItems: 1,
    }),
    excludeFields: s.array("Product fields to exclude from the response.", s.string("A product field name."), {
      minItems: 1,
    }),
  },
  { optional: ["include", "includeFields", "excludeFields"] },
);
const productCreateInputSchema = s.object(
  "Product fields for creating a BigCommerce catalog product.",
  {
    name: s.string("The product name.", { minLength: 1, maxLength: 250 }),
    type: productTypeSchema,
    price: priceSchema,
    sku: s.string("The product SKU.", { minLength: 1, maxLength: 255 }),
    weight: s.number("The product weight.", { minimum: 0 }),
    description: s.string("The product description as HTML or plain text."),
    isVisible: s.boolean("Whether the product is visible in the storefront."),
    inventoryTracking: inventoryTrackingSchema,
    inventoryLevel: s.integer("The product inventory level."),
    categories: s.array(
      "BigCommerce category IDs assigned to the product.",
      s.integer("A category ID.", { minimum: 1 }),
      {
        minItems: 1,
      },
    ),
    brandId: s.integer("The BigCommerce brand ID.", { minimum: 1 }),
    customUrl: s.string("The custom URL path for the product.", { minLength: 1 }),
  },
  {
    optional: [
      "sku",
      "description",
      "isVisible",
      "inventoryTracking",
      "inventoryLevel",
      "categories",
      "brandId",
      "customUrl",
    ],
  },
);
const productUpdateInputSchema = s.object(
  "Product fields for updating a BigCommerce catalog product.",
  {
    productId: productIdSchema,
    name: s.string("The product name.", { minLength: 1, maxLength: 250 }),
    type: productTypeSchema,
    price: priceSchema,
    sku: s.string("The product SKU.", { minLength: 1, maxLength: 255 }),
    weight: s.number("The product weight.", { minimum: 0 }),
    description: s.string("The product description as HTML or plain text."),
    isVisible: s.boolean("Whether the product is visible in the storefront."),
    inventoryTracking: inventoryTrackingSchema,
    inventoryLevel: s.integer("The product inventory level."),
    categories: s.array(
      "BigCommerce category IDs assigned to the product.",
      s.integer("A category ID.", { minimum: 1 }),
      {
        minItems: 1,
      },
    ),
    brandId: s.integer("The BigCommerce brand ID.", { minimum: 1 }),
    customUrl: s.string("The custom URL path for the product.", { minLength: 1 }),
  },
  {
    optional: [
      "name",
      "type",
      "price",
      "sku",
      "weight",
      "description",
      "isVisible",
      "inventoryTracking",
      "inventoryLevel",
      "categories",
      "brandId",
      "customUrl",
    ],
  },
);

export type BigCommerceActionName =
  | "list_products"
  | "get_product"
  | "create_product"
  | "update_product"
  | "delete_product";

export const bigCommerceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_products",
    description: "List BigCommerce catalog products with common filters and pagination.",
    requiredScopes: [],
    inputSchema: productListInputSchema,
    outputSchema: s.actionOutput(
      {
        products: s.array("Products returned by BigCommerce.", productSchema),
        pagination: paginationSchema,
      },
      "The normalized BigCommerce product list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve one BigCommerce catalog product by ID.",
    requiredScopes: [],
    inputSchema: productReadInputSchema,
    outputSchema: s.actionOutput(
      {
        product: productSchema,
      },
      "The normalized BigCommerce product response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_product",
    description: "Create a BigCommerce catalog product from JSON-friendly fields.",
    requiredScopes: [],
    inputSchema: productCreateInputSchema,
    outputSchema: s.actionOutput(
      {
        product: productSchema,
      },
      "The normalized BigCommerce product creation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_product",
    description: "Update provided fields on a BigCommerce catalog product.",
    requiredScopes: [],
    inputSchema: productUpdateInputSchema,
    outputSchema: s.actionOutput(
      {
        product: productSchema,
      },
      "The normalized BigCommerce product update response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_product",
    description: "Delete a BigCommerce catalog product by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for deleting a BigCommerce product.", {
      productId: productIdSchema,
    }),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether the product delete request succeeded."),
        productId: productIdSchema,
      },
      "The normalized BigCommerce product deletion response.",
    ),
  }),
];
