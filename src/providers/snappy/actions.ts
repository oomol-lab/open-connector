import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const item = s.object(
  "Resource returned by Snappy; fields depend on the requested projection.",
  {},
  { required: [], additionalProperties: true },
);
const links = s.looseObject("Pagination links; use the next link query parameters for the next call.", {
  first: s.nullable(s.string("First page link.")),
  next: s.nullable(s.string("Next page link, or null on the last page.")),
  prev: s.nullable(s.string("Previous page link, or null when unavailable.")),
});
const price = s.looseObject("Price in this country.", {
  amount: s.number("Price amount."),
  currency: s.string("ISO currency code."),
});
const product = s.object(
  "Product details, including requested expansions.",
  {
    id: s.string("Product identifier."),
    title: s.string("Product title."),
    catalog: s.string("Product catalog."),
    priceRange: s.looseObject("Product price range.", { min: price, max: price }),
    variantsCount: s.integer("Number of product variants."),
    createdAt: s.string("Creation timestamp."),
    media: s.array("Product media URLs.", item),
  },
  { required: ["id", "title"], additionalProperties: true },
);
const variant = s.object(
  "Variant details, including requested expansions.",
  {
    id: s.string("Variant identifier."),
    title: s.string("Variant title."),
    selectedOptions: s.record("Selected option values.", s.string("Option value.")),
    taxable: s.boolean("Whether the variant is taxable."),
    price,
    priceBreakdown: s.looseObject("Price breakdown.", {
      ddp: s.number("Duties and import taxes."),
      shippingFee: s.number("Shipping fee."),
      itemPrice: s.number("Item price before shipping and duties."),
    }),
    media: s.array("Variant media URLs.", item),
  },
  { required: ["id", "title"], additionalProperties: true },
);
const namedResource = s.object(
  "Named Snappy resource.",
  {
    id: s.string("Resource identifier."),
    name: s.string("Resource name."),
  },
  { required: [], additionalProperties: true },
);
function page(resource: typeof item) {
  return s.looseObject("Paginated Snappy response.", {
    data: s.array("Resources on this page.", resource),
    links,
  });
}
export const snappyActions: ActionDefinition[] = [
  defineProviderAction("snappy", {
    name: "list_accounts",
    description: "List accounts available to the API key.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        "filter[name]": s.string("Case-insensitive substring filter on account name."),
        "fields": s.array(
          "Comma-separated field projection. Valid values: id, name.",
          s.stringEnum("Requested field or filter value.", ["id", "name"]),
          { minItems: 1, uniqueItems: true },
        ),
        "page[number]": s.integer("1-indexed page number.", { minimum: 1 }),
        "page[size]": s.integer("Number of accounts per page (max 1000, default 100).", {
          minimum: 1,
          maximum: 1000,
        }),
      },
      { optional: ["filter[name]", "fields", "page[number]", "page[size]"] },
    ),
    outputSchema: page(namedResource),
  }),
  defineProviderAction("snappy", {
    name: "list_collections",
    description: "List gift collections for an account.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        "filter[location]": s.string(
          "Comma-separated ISO 3166-1 alpha-2 country codes. Only collections supporting all locations are returned.",
          { pattern: "^[A-Z]{2}(,[A-Z]{2})*$" },
        ),
        "filter[maxPrice]": s.nullable(
          s.number("Budget bucket selector for thumbnails.", { minimum: 0, maximum: 99999 }),
        ),
        "filter[tag]": s.array(
          "Comma-separated collection tags (`gifts`, `swag`, `custom`).",
          s.stringEnum("Requested field or filter value.", ["gifts", "swag", "custom"]),
        ),
        "filter[search]": s.string("Free-text search on collection name (max 100 characters).", {
          maxLength: 100,
        }),
        "fields": s.array(
          "Optional fields to include.",
          s.stringEnum("Requested field or filter value.", [
            "priceRange",
            "description",
            "createdAt",
            "updatedAt",
            "createdVia",
          ]),
        ),
        "sort": s.stringEnum("Sort field. Prefix with `-` for descending. Defaults to `rank`.", [
          "rank",
          "name",
          "-name",
          "createdAt",
          "-createdAt",
        ]),
        "page[number]": s.integer("1-indexed page number.", { minimum: 1 }),
        "page[size]": s.integer("Number of collections per page (max 150, default 100).", {
          minimum: 1,
          maximum: 150,
        }),
        "accountId": s.string("Required. Account identifier.", { minLength: 1 }),
      },
      {
        optional: [
          "filter[location]",
          "filter[maxPrice]",
          "filter[tag]",
          "filter[search]",
          "fields",
          "sort",
          "page[number]",
          "page[size]",
        ],
      },
    ),
    outputSchema: page(namedResource),
  }),
  defineProviderAction("snappy", {
    name: "get_collection",
    description: "Get a gift collection and its metadata.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        "collectionId": s.string("Collection identifier.", { pattern: "^[A-Za-z0-9]{8,}$" }),
        "filter[location]": s.string(
          "Comma-separated ISO 3166-1 alpha-2 country codes. Thumbnails and budget data use the first location.",
          { pattern: "^[A-Z]{2}(,[A-Z]{2})*$" },
        ),
        "filter[maxPrice]": s.nullable(
          s.number("Budget bucket selector for thumbnails.", { minimum: 0, maximum: 99999 }),
        ),
        "fields": s.array(
          "Optional fields: `priceRange`, `createdVia`.",
          s.stringEnum("Requested field or filter value.", ["priceRange", "createdVia"]),
        ),
        "accountId": s.string("Required. Account identifier.", { minLength: 1 }),
      },
      { optional: ["filter[location]", "filter[maxPrice]", "fields"] },
    ),
    outputSchema: s.looseObject("Collection response.", { data: namedResource }),
  }),
  defineProviderAction("snappy", {
    name: "list_collection_products",
    description: "Browse products in a gift collection.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        "collectionId": s.string("Collection identifier.", { pattern: "^[A-Za-z0-9]{8,}$" }),
        "filter[catalog]": s.stringEnum(
          "Which product catalog to search. Required on product list/search endpoints. Defaults to marketplace.",
          ["marketplace", "swag", "giftCards", "donations"],
        ),
        "filter[search]": s.string("Free-text search across product title and description.", {
          pattern: "^[^<>]*$",
        }),
        "filter[price][gte]": s.nullable(s.number("Inclusive minimum price filter.", { minimum: 0 })),
        "filter[price][lte]": s.nullable(s.number("Inclusive maximum price filter.", { minimum: 0 })),
        "location": s.string("ISO 3166-1 alpha-2 country code.", { pattern: "^[A-Z]{2}$" }),
        "include": s.array(
          "Related entities to include.",
          s.stringEnum("Requested field or filter value.", ["brand", "tags"]),
        ),
        "fields": s.array(
          "Computed or expanded product fields for list responses.",
          s.stringEnum("Requested field or filter value.", ["priceRange", "variantsCount"]),
        ),
        "page[cursor]": s.string("Opaque continuation token from the previous response links.next."),
        "page[size]": s.integer("Number of products per page (max 300, default 100).", {
          minimum: 1,
          maximum: 300,
        }),
        "sort": s.string("JSON:API sort parameter. Single field; prefix with `-` for descending.", {
          pattern: "^-?(minPrice|createdAt)$",
        }),
        "accountId": s.string("Must be provided to retrieve swag products.", { minLength: 1 }),
      },
      {
        optional: [
          "filter[catalog]",
          "filter[search]",
          "filter[price][gte]",
          "filter[price][lte]",
          "location",
          "include",
          "fields",
          "page[cursor]",
          "page[size]",
          "sort",
          "accountId",
        ],
      },
    ),
    outputSchema: page(product),
  }),
  defineProviderAction("snappy", {
    name: "list_products",
    description: "Search the gift catalog by price, brand, tags, and text.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        "filter[catalog]": s.stringEnum(
          "Which product catalog to search. Required on product list/search endpoints. Defaults to marketplace.",
          ["marketplace", "swag", "giftCards", "donations"],
        ),
        "filter[search]": s.string("Free-text search across product title and description.", {
          pattern: "^[^<>]*$",
        }),
        "filter[price][gte]": s.nullable(s.number("Inclusive minimum price filter.", { minimum: 0 })),
        "filter[price][lte]": s.nullable(s.number("Inclusive maximum price filter.", { minimum: 0 })),
        "location": s.string("ISO 3166-1 alpha-2 country code.", { pattern: "^[A-Z]{2}$" }),
        "include": s.array(
          "Related entities to include.",
          s.stringEnum("Requested field or filter value.", ["brand", "tags"]),
        ),
        "fields": s.array(
          "Computed or expanded product fields for list responses.",
          s.stringEnum("Requested field or filter value.", ["priceRange", "variantsCount"]),
        ),
        "page[cursor]": s.string("Opaque continuation token from the previous response links.next."),
        "page[size]": s.integer("Number of products per page (max 300, default 100).", {
          minimum: 1,
          maximum: 300,
        }),
        "sort": s.string("JSON:API sort parameter. Single field; prefix with `-` for descending.", {
          pattern: "^-?(minPrice|createdAt)$",
        }),
        "filter[brandId]": s.array(
          "Comma-separated list of brand ids (OR semantics).",
          s.string("Requested field or filter value."),
        ),
        "filter[brandName]": s.string("Case-insensitive substring search on brand name."),
        "filter[tagId]": s.array(
          "Comma-separated list of tag ids (OR semantics).",
          s.string("Requested field or filter value."),
        ),
        "accountId": s.string("Must be provided to retrieve swag products.", { minLength: 1 }),
      },
      {
        optional: [
          "filter[catalog]",
          "filter[search]",
          "filter[price][gte]",
          "filter[price][lte]",
          "location",
          "include",
          "fields",
          "page[cursor]",
          "page[size]",
          "sort",
          "filter[brandId]",
          "filter[brandName]",
          "filter[tagId]",
          "accountId",
        ],
      },
    ),
    outputSchema: page(product),
  }),
  defineProviderAction("snappy", {
    name: "get_product",
    description: "Get a product with optional related entities and computed fields.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        "productId": s.string("Stable product ID.", {
          pattern: "^(?:^[A-Za-z0-9]{8,}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$)$",
        }),
        "location": s.string("ISO 3166-1 alpha-2 country code.", { pattern: "^[A-Z]{2}$" }),
        "filter[price][gte]": s.nullable(s.number("Inclusive minimum variant price filter.", { minimum: 0 })),
        "filter[price][lte]": s.nullable(s.number("Inclusive maximum variant price filter.", { minimum: 0 })),
        "include": s.array(
          "Related entities to include.",
          s.stringEnum("Requested field or filter value.", ["brand", "tags"]),
        ),
        "fields": s.array(
          "Computed or expanded product fields.",
          s.stringEnum("Requested field or filter value.", ["options", "priceRange", "variantsCount"]),
        ),
        "accountId": s.string("Must be provided to retrieve swag products.", { minLength: 1 }),
      },
      {
        optional: ["location", "filter[price][gte]", "filter[price][lte]", "include", "fields", "accountId"],
      },
    ),
    outputSchema: product,
  }),
  defineProviderAction("snappy", {
    name: "list_product_variants",
    description: "List orderable variants of a product with prices and pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        "productId": s.string("Stable product ID.", {
          pattern: "^(?:^[A-Za-z0-9]{8,}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$)$",
        }),
        "location": s.string("ISO 3166-1 alpha-2 country code.", { pattern: "^[A-Z]{2}$" }),
        "filter[price][gte]": s.nullable(s.number("Inclusive minimum variant price filter.", { minimum: 0 })),
        "filter[price][lte]": s.nullable(s.number("Inclusive maximum variant price filter.", { minimum: 0 })),
        "include": s.array("Related entities to include.", s.stringEnum("Requested field or filter value.", ["brand"])),
        "fields": s.array(
          "Comma-separated list of variant-level field expansions.\n\n- `pricing` - includes `price` and `priceBreakdown`.\n- `details` - includes the variant `details` wrapper.\n\nUse `include=brand` to include the variant's `brand` object (nullable).\n\nWhen omitted, `price`, `priceBreakdown`, and `details` are not returned in the public response.",
          s.stringEnum("Requested field or filter value.", ["pricing", "details"]),
        ),
        "page[number]": s.integer("1-indexed page number.", { minimum: 1 }),
        "page[size]": s.integer("Number of variants per page (max 300, default 100).", {
          minimum: 1,
          maximum: 300,
        }),
        "accountId": s.string("Must be provided to retrieve swag products.", { minLength: 1 }),
      },
      {
        optional: [
          "location",
          "filter[price][gte]",
          "filter[price][lte]",
          "include",
          "fields",
          "page[number]",
          "page[size]",
          "accountId",
        ],
      },
    ),
    outputSchema: page(variant),
  }),
  defineProviderAction("snappy", {
    name: "get_variant",
    description: "Get a variant with optional pricing and details.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        variantId: s.string("Variant ID.", {
          pattern: "^(?:^[A-Za-z0-9]{8,}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$)$",
        }),
        location: s.string("ISO 3166-1 alpha-2 country code.", { pattern: "^[A-Z]{2}$" }),
        include: s.array("Related entities to include.", s.stringEnum("Requested field or filter value.", ["brand"])),
        fields: s.array(
          "Comma-separated list of variant-level field expansions.\n\n- `pricing` - includes `price` and `priceBreakdown`.\n- `details` - includes the variant `details` wrapper.\n\nUse `include=brand` to include the variant's `brand` object (nullable).\n\nWhen omitted, `price`, `priceBreakdown`, and `details` are not returned in the public response.",
          s.stringEnum("Requested field or filter value.", ["pricing", "details"]),
        ),
        accountId: s.string("Must be provided to retrieve swag products.", { minLength: 1 }),
      },
      { optional: ["location", "include", "fields", "accountId"] },
    ),
    outputSchema: variant,
  }),
  defineProviderAction("snappy", {
    name: "get_variant_availability",
    description: "Get country availability and pricing for a variant.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        variantId: s.string("Variant ID.", {
          pattern: "^(?:^[A-Za-z0-9]{8,}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$)$",
        }),
        accountId: s.string("Must be provided to retrieve swag products.", { minLength: 1 }),
      },
      { optional: ["accountId"] },
    ),
    outputSchema: s.record(
      "Availability keyed by ISO country code; absent countries are unavailable.",
      s.object(
        "Country availability and optional pricing.",
        {
          isAvailable: s.boolean("Whether the variant is available in this country."),
          price: s.looseObject("Price in this country.", {
            amount: s.number("Price amount."),
            currency: s.string("ISO currency code."),
          }),
        },
        { required: ["isAvailable"], additionalProperties: true },
      ),
    ),
  }),
  defineProviderAction("snappy", {
    name: "list_product_tags",
    description: "Search tags used to filter the gift catalog.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Snappy request parameters.",
      {
        "filter[name]": s.string("Search string to filter tags by name (minimum 3 characters).", {
          minLength: 3,
        }),
        "page[number]": s.integer("1-indexed page number.", { minimum: 1 }),
        "page[size]": s.integer("Number of tags per page (max 100, default 100).", {
          minimum: 1,
          maximum: 100,
        }),
        "accountId": s.string("Must be provided to retrieve swag products.", { minLength: 1 }),
      },
      { optional: ["filter[name]", "page[number]", "page[size]", "accountId"] },
    ),
    outputSchema: page(namedResource),
  }),
];
