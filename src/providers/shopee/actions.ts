import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shopee";
const entityIdSchema = (description: string) => s.integer(description, { minimum: 1 });
const timestampSchema = (description: string) => s.integer(description, { minimum: 0 });
const rawDataSchema = s.looseObject("The response data returned by Shopee Open Platform.");
const responseSchema = s.object(
  "A normalized Shopee Open Platform response.",
  {
    requestId: s.string("The Shopee request ID used for upstream error tracking."),
    data: rawDataSchema,
  },
  { optional: ["requestId"] },
);

const merchantInputSchema = s.object(
  "A Shopee merchant selected from the authorized CNSC account.",
  {
    merchantId: entityIdSchema("The Shopee merchant ID. Omit it when the connection has exactly one merchant."),
  },
  { optional: ["merchantId"] },
);

const shopInputSchema = s.object(
  "A Shopee shop selected from the authorized account.",
  {
    shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
  },
  { optional: ["shopId"] },
);

const languageSchema = s.stringEnum("The language used for category and attribute names.", ["en", "zh-hans"]);
const attributeValueSchema = s.object(
  "A value assigned to a Shopee global product attribute.",
  {
    valueId: s.integer("The predefined Shopee attribute value ID, or 0 for a custom value."),
    originalValueName: s.string("The predefined or custom attribute value name."),
    valueUnit: s.string("The unit for a quantitative attribute value."),
  },
  { optional: ["valueId", "originalValueName", "valueUnit"] },
);
const attributeSchema = s.object(
  "A Shopee global product attribute and its selected values.",
  {
    attributeId: entityIdSchema("The Shopee attribute ID."),
    values: s.array("The values selected for this attribute.", attributeValueSchema, {
      minItems: 1,
    }),
  },
  { optional: ["values"] },
);
const sellerStockSchema = s.object("Stock held at a Shopee seller stock location.", {
  locationId: s.string("The Shopee seller stock location ID."),
  stock: s.integer("The available stock at this location.", { minimum: 0 }),
});
const itemStatusSchema = s.stringEnum("A Shopee listing status.", [
  "NORMAL",
  "BANNED",
  "UNLIST",
  "REVIEWING",
  "SELLER_DELETE",
  "SHOPEE_DELETE",
]);
const priceUpdateSchema = s.object(
  "A new price for an item or variation model.",
  {
    modelId: entityIdSchema("The Shopee model ID. Omit it for an item without variations."),
    originalPrice: s.number("The new original price in the shop currency.", {
      exclusiveMinimum: 0,
    }),
  },
  { optional: ["modelId"] },
);
const stockLocationUpdateSchema = s.object(
  "Stock assigned to one seller warehouse location.",
  {
    locationId: s.string("The warehouse location ID returned by Shopee."),
    stock: s.integer("The new available stock at this location.", { minimum: 0 }),
  },
  { optional: ["locationId"] },
);
const stockUpdateSchema = s.object(
  "New stock for an item or variation model.",
  {
    modelId: entityIdSchema("The Shopee model ID. Omit it for an item without variations."),
    sellerStock: s.array(
      "The new seller stock values, optionally split by warehouse location.",
      stockLocationUpdateSchema,
      { minItems: 1 },
    ),
  },
  { optional: ["modelId"] },
);
const packageInputProperties = {
  shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
  orderSerialNumber: s.string("The Shopee order serial number."),
  packageNumber: s.string("The package number for an order split into packages."),
};

export const shopeeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_merchant_info",
    operationType: "read",
    description: "Get the identity, region, currency, and authorization status of a Shopee merchant.",
    requiredScopes: ["shopee.read"],
    inputSchema: merchantInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_global_categories",
    operationType: "read",
    description: "List the Shopee global product category tree for a cross-border merchant.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "The merchant and display language for the global category tree.",
      {
        merchantId: entityIdSchema("The Shopee merchant ID. Omit it when the connection has exactly one merchant."),
        language: languageSchema,
      },
      { optional: ["merchantId", "language"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_global_attribute_tree",
    operationType: "read",
    description: "Get Shopee global product attributes for up to 20 category IDs.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "The merchant, categories, and display language for global product attributes.",
      {
        merchantId: entityIdSchema("The Shopee merchant ID. Omit it when the connection has exactly one merchant."),
        categoryIds: s.array(
          "The global category IDs whose attribute definitions should be returned.",
          entityIdSchema("A Shopee global category ID."),
          { minItems: 1, maxItems: 20, uniqueItems: true },
        ),
        language: languageSchema,
      },
      { optional: ["merchantId", "language"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_global_brands",
    operationType: "read",
    description: "List Shopee brands available for a global product category.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "The category and pagination parameters for Shopee global brands.",
      {
        merchantId: entityIdSchema("The Shopee merchant ID. Omit it when the connection has exactly one merchant."),
        categoryId: entityIdSchema("The Shopee global category ID."),
        offset: s.integer("The zero-based result offset.", { minimum: 0 }),
        pageSize: s.integer("The number of brands to return, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        status: s.integer("The brand status: 1 for normal or 2 for pending.", {
          minimum: 1,
          maximum: 2,
        }),
      },
      { optional: ["merchantId", "offset", "pageSize", "status"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "upload_product_image",
    operationType: "write",
    description: "Download a public image URL and upload it to Shopee Media Space for products.",
    requiredScopes: ["shopee.write"],
    inputSchema: s.object(
      "A public image URL and Shopee image processing options.",
      {
        imageUrl: s.string("A public HTTPS URL for a JPG, JPEG, or PNG image up to 10 MB.", {
          format: "uri",
        }),
        scene: s.stringEnum("How Shopee processes the image.", ["normal", "desc"]),
        ratio: s.stringEnum("The requested image ratio for eligible sellers.", ["1:1", "3:4"]),
      },
      { optional: ["scene", "ratio"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "create_global_item",
    operationType: "write",
    description: "Create a Shopee global product draft for a mainland China CNSC merchant.",
    requiredScopes: ["shopee.write"],
    inputSchema: s.object(
      "The product information used to create a Shopee global product draft.",
      {
        merchantId: entityIdSchema("The Shopee merchant ID. Omit it when the connection has exactly one merchant."),
        categoryId: entityIdSchema("The Shopee global category ID."),
        name: s.string("The global product name."),
        description: s.string("The global product description."),
        sku: s.string("The seller-defined global product SKU."),
        imageIds: s.stringArray("Shopee Media Space image IDs for the product.", {
          minItems: 1,
          maxItems: 9,
          uniqueItems: true,
          itemDescription: "A Shopee Media Space image ID.",
        }),
        originalPrice: s.number("The original global product price in the merchant base currency.", {
          exclusiveMinimum: 0,
        }),
        stock: s.integer("The available normal stock for the product.", { minimum: 0 }),
        weight: s.number("The package weight in kilograms.", { exclusiveMinimum: 0 }),
        packageLength: s.number("The package length in centimeters.", { exclusiveMinimum: 0 }),
        packageWidth: s.number("The package width in centimeters.", { exclusiveMinimum: 0 }),
        packageHeight: s.number("The package height in centimeters.", { exclusiveMinimum: 0 }),
        daysToShip: s.integer("The number of days needed to ship the product.", { minimum: 1 }),
        condition: s.stringEnum("The product condition.", ["NEW", "USED"]),
        brandId: entityIdSchema("The Shopee brand ID."),
        brandName: s.string("The original brand name."),
        attributes: s.array("The product attributes required by its category.", attributeSchema),
        sellerStock: s.array("Stock allocated to Shopee seller stock locations.", sellerStockSchema),
      },
      {
        optional: [
          "merchantId",
          "sku",
          "imageIds",
          "stock",
          "packageLength",
          "packageWidth",
          "packageHeight",
          "brandId",
          "brandName",
          "attributes",
          "sellerStock",
        ],
      },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_merchant_shops",
    operationType: "read",
    description: "List shops authorized and bound to a Shopee merchant.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "Pagination parameters for shops bound to a Shopee merchant.",
      {
        merchantId: entityIdSchema("The Shopee merchant ID. Omit it when the connection has exactly one merchant."),
        page: s.integer("The one-based page number to retrieve.", { minimum: 1 }),
        pageSize: s.integer("The number of shops to return, from 1 to 500.", {
          minimum: 1,
          maximum: 500,
        }),
      },
      { optional: ["merchantId", "page", "pageSize"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_shop_info",
    operationType: "read",
    description: "Get the profile, region, authorization, and cross-border status of a Shopee shop.",
    requiredScopes: ["shopee.read"],
    inputSchema: shopInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_global_items",
    operationType: "read",
    description: "List global products owned by a Shopee cross-border merchant.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "Cursor and update-time filters for Shopee global products.",
      {
        merchantId: entityIdSchema("The Shopee merchant ID. Omit it when the connection has exactly one merchant."),
        cursor: s.string("The cursor returned by the previous page."),
        pageSize: s.integer("The number of global products to return, from 1 to 50.", {
          minimum: 1,
          maximum: 50,
        }),
        updatedFrom: timestampSchema("The earliest item update time as a Unix timestamp in seconds."),
        updatedTo: timestampSchema("The latest item update time as a Unix timestamp in seconds."),
      },
      { optional: ["merchantId", "cursor", "pageSize", "updatedFrom", "updatedTo"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_global_items",
    operationType: "read",
    description: "Get details for up to 20 Shopee global products.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "Shopee global product identifiers.",
      {
        merchantId: entityIdSchema("The Shopee merchant ID. Omit it when the connection has exactly one merchant."),
        globalItemIds: s.array("The global product IDs to retrieve.", entityIdSchema("A Shopee global product ID."), {
          minItems: 1,
          maxItems: 20,
          uniqueItems: true,
        }),
      },
      { optional: ["merchantId"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_shop_items",
    operationType: "read",
    description: "List Shopee shop items by listing status and update time.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "Filters and offset pagination for Shopee shop items.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        offset: s.integer("The zero-based result offset.", { minimum: 0 }),
        pageSize: s.integer("The number of items to return, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        statuses: s.array("The listing statuses to include.", itemStatusSchema, {
          minItems: 1,
          uniqueItems: true,
        }),
        updatedFrom: timestampSchema("The earliest item update time as a Unix timestamp."),
        updatedTo: timestampSchema("The latest item update time as a Unix timestamp."),
      },
      { optional: ["shopId", "offset", "pageSize", "updatedFrom", "updatedTo"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_shop_items",
    operationType: "read",
    description: "Get base information for up to 50 Shopee shop items.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "Shopee shop item identifiers and optional detail sections.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        itemIds: s.array("The Shopee item IDs to retrieve.", entityIdSchema("A Shopee item ID."), {
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
        }),
        includeTaxInfo: s.boolean("Whether to include item tax information."),
        includeComplaintPolicy: s.boolean("Whether to include item complaint policies."),
      },
      { optional: ["shopId", "includeTaxInfo", "includeComplaintPolicy"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_item_models",
    operationType: "read",
    description: "Get variation tiers, model prices, and model stock for a Shopee shop item.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "A Shopee shop item whose variation models should be returned.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        itemId: entityIdSchema("The Shopee item ID."),
      },
      { optional: ["shopId"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "update_item_prices",
    operationType: "destructive",
    description: "Replace prices for up to 50 models of one Shopee shop item.",
    requiredScopes: ["shopee.write"],
    inputSchema: s.object(
      "A Shopee shop item and its replacement prices.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        itemId: entityIdSchema("The Shopee item ID."),
        prices: s.array("The replacement prices for the item or its models.", priceUpdateSchema, {
          minItems: 1,
          maxItems: 50,
        }),
      },
      { optional: ["shopId"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "update_item_stocks",
    operationType: "destructive",
    description: "Replace seller stock for up to 50 models of one Shopee shop item.",
    requiredScopes: ["shopee.write"],
    inputSchema: s.object(
      "A Shopee shop item and its replacement seller stock.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        itemId: entityIdSchema("The Shopee item ID."),
        stocks: s.array("The replacement stock for the item or its models.", stockUpdateSchema, {
          minItems: 1,
          maxItems: 50,
        }),
      },
      { optional: ["shopId"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List Shopee shop orders created or updated in a time range of at most 15 days.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "Filters and cursor pagination for Shopee shop orders.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        timeRangeField: s.stringEnum("The order timestamp field used for the range.", ["create_time", "update_time"]),
        timeFrom: timestampSchema("The inclusive range start as a Unix timestamp in seconds."),
        timeTo: timestampSchema("The inclusive range end as a Unix timestamp in seconds."),
        pageSize: s.integer("The number of orders to return, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        cursor: s.string("The cursor returned by the previous page."),
        orderStatus: s.stringEnum("The Shopee order status to include.", [
          "UNPAID",
          "READY_TO_SHIP",
          "PROCESSED",
          "SHIPPED",
          "COMPLETED",
          "IN_CANCEL",
          "CANCELLED",
          "INVOICE_PENDING",
        ]),
      },
      { optional: ["shopId", "timeRangeField", "pageSize", "cursor", "orderStatus"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_orders",
    operationType: "read",
    description: "Get detailed information for up to 50 Shopee orders from one shop.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "Shopee order identifiers and optional response fields.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        orderSerialNumbers: s.stringArray("The Shopee order serial numbers to retrieve.", {
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
          itemDescription: "A Shopee order serial number.",
        }),
        optionalFields: s.stringArray("Additional documented order fields to include in the response.", {
          minItems: 1,
          uniqueItems: true,
          itemDescription: "A field name from the Shopee get order detail API.",
        }),
      },
      { optional: ["shopId", "optionalFields"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_shipping_parameters",
    operationType: "read",
    description: "Get the pickup, drop-off, or non-integrated shipping options for an order package.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object("A Shopee order package ready for shipment.", packageInputProperties, {
      optional: ["shopId", "packageNumber"],
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "ship_order",
    operationType: "write",
    description: "Arrange pickup, drop-off, or non-integrated shipment for a Shopee order package.",
    requiredScopes: ["shopee.write"],
    inputSchema: s.object(
      "A Shopee order package and one shipping method returned by get_shipping_parameters.",
      {
        ...packageInputProperties,
        pickup: s.object(
          "Pickup options returned by Shopee.",
          {
            addressId: entityIdSchema("The pickup address ID."),
            pickupTimeId: s.string("The pickup time-slot ID."),
            trackingNumber: s.string("A carrier-assigned tracking number when required."),
          },
          { optional: ["pickupTimeId", "trackingNumber"] },
        ),
        dropoff: s.object(
          "Drop-off options returned by Shopee.",
          {
            branchId: entityIdSchema("The carrier branch ID."),
            senderRealName: s.string("The sender's legal name when required."),
            trackingNumber: s.string("A carrier-assigned tracking number when required."),
            slug: s.string("The selected third-party logistics provider slug."),
          },
          { optional: ["branchId", "senderRealName", "trackingNumber", "slug"] },
        ),
        nonIntegrated: s.object(
          "Options for a non-integrated logistics channel.",
          { trackingNumber: s.string("The carrier-assigned tracking number.") },
          { optional: ["trackingNumber"] },
        ),
      },
      { optional: ["shopId", "packageNumber", "pickup", "dropoff", "nonIntegrated"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_tracking_number",
    operationType: "read",
    description: "Get carrier tracking numbers for a shipped Shopee order package.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "A shipped Shopee order package and optional tracking fields.",
      {
        ...packageInputProperties,
        optionalFields: s.array(
          "Additional tracking number fields to return.",
          s.stringEnum("A supported tracking number field.", [
            "plp_number",
            "first_mile_tracking_number",
            "last_mile_tracking_number",
          ]),
          { uniqueItems: true },
        ),
      },
      { optional: ["shopId", "packageNumber", "optionalFields"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_tracking_info",
    operationType: "read",
    description: "Get logistics tracking events for a Shopee order package.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object("A shipped Shopee order package.", packageInputProperties, {
      optional: ["shopId", "packageNumber"],
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_returns",
    operationType: "read",
    description: "List Shopee returns by creation time, update time, and workflow status.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "Filters and page pagination for Shopee returns.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        page: s.integer("The one-based page number.", { minimum: 1 }),
        pageSize: s.integer("The number of returns to include, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        createdFrom: timestampSchema("The earliest return creation time as a Unix timestamp."),
        createdTo: timestampSchema("The latest return creation time as a Unix timestamp."),
        updatedFrom: timestampSchema("The earliest return update time as a Unix timestamp."),
        updatedTo: timestampSchema("The latest return update time as a Unix timestamp."),
        status: s.string("A Shopee ReturnStatus value."),
        negotiationStatus: s.string("A Shopee NegotiationStatus value."),
        sellerProofStatus: s.string("A Shopee SellerProofStatus value."),
        sellerCompensationStatus: s.string("A Shopee SellerCompensationStatus value."),
      },
      {
        optional: [
          "shopId",
          "page",
          "pageSize",
          "createdFrom",
          "createdTo",
          "updatedFrom",
          "updatedTo",
          "status",
          "negotiationStatus",
          "sellerProofStatus",
          "sellerCompensationStatus",
        ],
      },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_return",
    operationType: "read",
    description: "Get the details and current workflow state of a Shopee return.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "A Shopee return selected from one shop.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        returnSerialNumber: s.string("The Shopee return serial number."),
      },
      { optional: ["shopId"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_order_escrow",
    operationType: "read",
    description: "Get Shopee accounting and fee details for one order.",
    requiredScopes: ["shopee.read"],
    inputSchema: s.object(
      "A Shopee order whose escrow accounting should be returned.",
      {
        shopId: entityIdSchema("The Shopee shop ID. Omit it when the connection has exactly one shop."),
        orderSerialNumber: s.string("The Shopee order serial number."),
      },
      { optional: ["shopId"] },
    ),
    outputSchema: responseSchema,
  }),
];
