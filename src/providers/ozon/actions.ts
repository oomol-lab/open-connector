import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema as ActionJsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ozon";

const identifierArray = (description: string) =>
  s.array(description, s.nonEmptyString("One Ozon identifier."), {
    minItems: 1,
    maxItems: 1000,
  });

const productVisibilityValues = [
  "ALL",
  "VISIBLE",
  "INVISIBLE",
  "EMPTY_STOCK",
  "NOT_MODERATED",
  "MODERATED",
  "DISABLED",
  "STATE_FAILED",
  "READY_TO_SUPPLY",
  "VALIDATION_STATE_PENDING",
  "VALIDATION_STATE_FAIL",
  "VALIDATION_STATE_SUCCESS",
  "TO_SUPPLY",
  "IN_SALE",
  "REMOVED_FROM_SALE",
  "OVERPRICED",
  "CRITICALLY_OVERPRICED",
  "EMPTY_BARCODE",
  "BARCODE_EXISTS",
  "QUARANTINE",
  "ARCHIVED",
  "OVERPRICED_WITH_STOCK",
  "PARTIAL_APPROVED",
  "AUTO_ARCHIVED",
  "MANUAL_ARCHIVED",
  "SEASONAL_AUTO_ARCHIVED",
  "VISIBLE_WITH_FBO_STOCK",
];

const productVisibilitySchema = s.stringEnum("The Ozon product visibility filter.", productVisibilityValues);

const productFilterSchema = s.object(
  "Filters Ozon products by identifiers or visibility.",
  {
    offer_id: identifierArray("Seller-defined offer identifiers to include."),
    product_id: identifierArray("Ozon product identifiers to include."),
    visibility: productVisibilitySchema,
  },
  { optional: ["offer_id", "product_id", "visibility"] },
);

const stockProductFilterSchema = s.object(
  "Filters Ozon products by identifiers or visibility.",
  {
    offer_id: identifierArray("Seller-defined offer identifiers to include."),
    product_id: identifierArray("Ozon product identifiers to include."),
    visibility: s.stringEnum("The Ozon stock visibility filter.", [...productVisibilityValues, "BANNED"]),
  },
  { optional: ["offer_id", "product_id", "visibility"] },
);

const listProductsInputSchema = s.object(
  "The input payload for listing Ozon products.",
  {
    filter: s.object(
      "Filters Ozon products by identifiers, SKUs, or visibility.",
      {
        offer_id: identifierArray("Seller-defined offer identifiers to include."),
        product_id: identifierArray("Ozon product identifiers to include."),
        skus: identifierArray("Ozon SKUs to include."),
        visibility: productVisibilitySchema,
      },
      { optional: ["offer_id", "product_id", "skus", "visibility"] },
    ),
    last_id: s.string("The last_id cursor returned by the previous page."),
    limit: s.integer("The maximum number of products to return.", { minimum: 1, maximum: 1000 }),
  },
  { optional: ["filter", "last_id", "limit"] },
);

const getProductInfoInputSchema: ActionJsonSchema = {
  ...s.object(
    "Identifiers for retrieving detailed Ozon product information.",
    {
      offer_id: identifierArray("Seller-defined offer identifiers to retrieve."),
      product_id: identifierArray("Ozon product identifiers to retrieve."),
      sku: identifierArray("Ozon SKUs to retrieve."),
    },
    { optional: ["offer_id", "product_id", "sku"] },
  ),
  anyOf: [{ required: ["offer_id"] }, { required: ["product_id"] }, { required: ["sku"] }],
};

const cursorProductInputSchema = (description: string, filter: ActionJsonSchema = productFilterSchema) =>
  s.object(
    description,
    {
      filter,
      limit: s.integer("The maximum number of products to return.", { minimum: 1, maximum: 1000 }),
      cursor: s.string("The cursor returned by the previous page."),
    },
    { optional: ["cursor"] },
  );

const fbsListInputSchema = s.object(
  "The input payload for listing Ozon FBS and rFBS postings.",
  {
    filter: s.object(
      "Filters Ozon FBS and rFBS postings.",
      {
        since: s.string("The inclusive beginning of the posting period in ISO 8601 format.", {
          format: "date-time",
        }),
        to: s.string("The inclusive end of the posting period in ISO 8601 format.", {
          format: "date-time",
        }),
        delivery_method_ids: identifierArray("Delivery method identifiers to include."),
        integration_type_flow: s.array(
          "Integration processing flows to include.",
          s.nonEmptyString("One integration processing flow."),
        ),
        is_blr_traceable: s.boolean("Whether to include only traceable Belarus products."),
        order_id: s.integer("The Ozon order identifier.", { minimum: 1 }),
        order_numbers: s.array("Order numbers to include.", s.nonEmptyString("One Ozon order number."), {
          minItems: 1,
          maxItems: 100,
        }),
        provider_ids: identifierArray("Delivery provider identifiers to include."),
        statuses: s.array("Posting statuses to include.", s.nonEmptyString("One Ozon posting status."), {
          minItems: 1,
        }),
        warehouse_ids: identifierArray("Warehouse identifiers to include."),
      },
      {
        optional: [
          "delivery_method_ids",
          "integration_type_flow",
          "is_blr_traceable",
          "order_id",
          "order_numbers",
          "provider_ids",
          "statuses",
          "warehouse_ids",
        ],
      },
    ),
    limit: s.integer("The maximum number of postings to return.", { minimum: 1, maximum: 100 }),
    cursor: s.string("The cursor returned by the previous page."),
    sort_dir: s.stringEnum("The posting sort direction.", ["ASC", "DESC"]),
    translit: s.boolean("Whether Ozon should transliterate returned addresses."),
    with: s.object(
      "Additional posting data to include.",
      {
        analytics_data: s.boolean("Whether to include analytics data."),
        barcodes: s.boolean("Whether to include posting barcodes."),
        financial_data: s.boolean("Whether to include financial data."),
        legal_info: s.boolean("Whether to include legal information."),
      },
      { optional: ["analytics_data", "barcodes", "financial_data", "legal_info"] },
    ),
  },
  { optional: ["cursor", "sort_dir", "translit", "with"] },
);

const getFbsPostingInputSchema = s.object(
  "The input payload for retrieving one Ozon FBS or rFBS posting.",
  {
    posting_number: s.nonEmptyString("The Ozon posting number."),
    with: s.object(
      "Additional posting data to include.",
      {
        analytics_data: s.boolean("Whether to include analytics data."),
        barcodes: s.boolean("Whether to include posting barcodes."),
        financial_data: s.boolean("Whether to include financial data."),
        legal_info: s.boolean("Whether to include legal information."),
        product_exemplars: s.boolean("Whether to include product exemplar data."),
        related_postings: s.boolean("Whether to include related posting numbers."),
        translit: s.boolean("Whether Ozon should transliterate returned values."),
      },
      {
        optional: [
          "analytics_data",
          "barcodes",
          "financial_data",
          "legal_info",
          "product_exemplars",
          "related_postings",
          "translit",
        ],
      },
    ),
  },
  { optional: ["with"] },
);

const sellerInfoOutputSchema = s.looseObject("Ozon seller account information.", {
  company: s.looseObject("The seller company information."),
  ratings: s.array("The seller ratings.", s.looseObject("One Ozon seller rating.")),
  subscription: s.looseObject("The seller subscription information."),
});

const resultOutputSchema = (description: string) =>
  s.looseObject(description, { result: s.looseObject("The Ozon result payload.") });

const itemsOutputSchema = (description: string) =>
  s.looseObject(description, {
    items: s.array("The returned Ozon resources.", s.looseObject("One Ozon resource.")),
  });

const fbsListOutputSchema = s.looseObject("An Ozon FBS posting list response.", {
  cursor: s.string("The cursor for the next page."),
  has_next: s.boolean("Whether more postings are available."),
  postings: s.array("The returned Ozon postings.", s.looseObject("One Ozon posting.")),
});

export const ozonActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_seller_info",
    description: "Retrieve information about the authenticated Ozon seller account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: sellerInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List products in the authenticated Ozon seller account.",
    requiredScopes: [],
    inputSchema: listProductsInputSchema,
    outputSchema: resultOutputSchema("An Ozon product list response."),
  }),
  defineProviderAction(service, {
    name: "get_product_info",
    description: "Retrieve detailed Ozon product information by offer, product, or SKU identifiers.",
    requiredScopes: [],
    inputSchema: getProductInfoInputSchema,
    outputSchema: itemsOutputSchema("An Ozon product information response."),
  }),
  defineProviderAction(service, {
    name: "list_product_prices",
    description: "List prices for products in the authenticated Ozon seller account.",
    requiredScopes: [],
    inputSchema: cursorProductInputSchema("The input payload for listing Ozon product prices."),
    outputSchema: itemsOutputSchema("An Ozon product price list response."),
  }),
  defineProviderAction(service, {
    name: "list_product_stocks",
    description: "List stock quantities for products in the authenticated Ozon seller account.",
    requiredScopes: [],
    inputSchema: cursorProductInputSchema(
      "The input payload for listing Ozon product stocks.",
      stockProductFilterSchema,
    ),
    outputSchema: itemsOutputSchema("An Ozon product stock list response."),
  }),
  defineProviderAction(service, {
    name: "list_fbs_postings",
    description: "List Ozon FBS and rFBS postings for a date range.",
    requiredScopes: [],
    inputSchema: fbsListInputSchema,
    outputSchema: fbsListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_fbs_posting",
    description: "Retrieve one Ozon FBS or rFBS posting by posting number.",
    requiredScopes: [],
    inputSchema: getFbsPostingInputSchema,
    outputSchema: resultOutputSchema("An Ozon FBS posting detail response."),
  }),
];
