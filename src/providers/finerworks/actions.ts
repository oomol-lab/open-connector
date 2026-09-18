import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "finerworks";

const idsSchema = s.array(
  "Optional IDs used to filter the returned catalog entries.",
  s.integer("A FinerWorks catalog entry ID."),
);
const statusSchema = s.looseObject("The status details returned by FinerWorks for the request.");
const productTypeSchema = s.looseObject("A FinerWorks product type and its compatible media and printable IDs.");
const mediaTypeSchema = s.looseObject("A FinerWorks media type and its compatible product and style information.");
const styleTypeSchema = s.looseObject("A FinerWorks style type, sizing constraints, and framing options.");
const priceSchema = s.looseObject("The FinerWorks price breakdown for one requested product.");

const catalogInputSchema = s.object(
  "Optional filters for a FinerWorks catalog request.",
  {
    ids: idsSchema,
  },
  { optional: ["ids"] },
);

const listProductTypesOutputSchema = s.object("The product types returned by FinerWorks.", {
  product_types: s.array("The matching product types.", productTypeSchema),
  status: statusSchema,
});

const listMediaTypesInputSchema = s.object(
  "Optional filters for a FinerWorks media catalog request.",
  {
    ids: idsSchema,
    site_id: s.integer("The optional FinerWorks site ID. The upstream default is 2."),
  },
  { optional: ["ids", "site_id"] },
);

const listMediaTypesOutputSchema = s.object("The media types returned by FinerWorks.", {
  media_types: s.array("The matching media types.", mediaTypeSchema),
  status: statusSchema,
});

const listStyleTypesOutputSchema = s.object("The style types returned by FinerWorks.", {
  style_types: s.array("The matching style types.", styleTypeSchema),
  status: statusSchema,
});

const pricingItemSchema = s.object("A product and quantity to price.", {
  product_qty: s.integer("The quantity of this product to price.", { minimum: 1 }),
  product_sku: s.nonEmptyString("The FinerWorks product code or virtual inventory SKU."),
});

const getPricesInputSchema = s.object(
  "Products to price through FinerWorks.",
  {
    products: s.array("One to fifty products to price.", pricingItemSchema, {
      minItems: 1,
      maxItems: 50,
    }),
    account_key: s.string("An optional delegated account key for authorized FinerWorks accounts."),
  },
  { optional: ["account_key"] },
);

const getPricesOutputSchema = s.object("The price breakdowns returned by FinerWorks.", {
  prices: s.array("Price breakdowns for the requested products.", priceSchema),
  status: statusSchema,
});

export const finerworksActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_product_types",
    operationType: "read",
    description: "List FinerWorks print product types, optionally filtered by product type IDs.",
    requiredScopes: [],
    inputSchema: catalogInputSchema,
    outputSchema: listProductTypesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_media_types",
    operationType: "read",
    description: "List FinerWorks print media types and their compatible product and style information.",
    requiredScopes: [],
    inputSchema: listMediaTypesInputSchema,
    outputSchema: listMediaTypesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_style_types",
    operationType: "read",
    description: "List FinerWorks print style types, sizing constraints, and framing options.",
    requiredScopes: [],
    inputSchema: catalogInputSchema,
    outputSchema: listStyleTypesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_prices",
    operationType: "read",
    description: "Get FinerWorks price breakdowns for one to fifty product codes or inventory SKUs.",
    requiredScopes: [],
    inputSchema: getPricesInputSchema,
    outputSchema: getPricesOutputSchema,
  }),
];
