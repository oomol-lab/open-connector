import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ship_bob";

const pageSizeSchema = s.positiveInteger("The maximum number of ShipBob records to return.");
const sortBySchema = s.nonEmptyString(
  "The ShipBob field expression used to sort results, such as Name or -total_on_hand_quantity.",
);

const pageLinksSchema = {
  first: s.nullable(s.string("The URL to retrieve the first page when ShipBob returned one.")),
  last: s.nullable(s.string("The URL to retrieve the last page when ShipBob returned one.")),
  next: s.nullable(s.string("The URL to retrieve the next page when ShipBob returned one.")),
  prev: s.nullable(s.string("The URL to retrieve the previous page when ShipBob returned one.")),
};

const channelSchema = s.object("A normalized ShipBob channel.", {
  id: s.integer("The ShipBob channel id."),
  name: s.nullable(s.string("The ShipBob channel name.")),
  applicationName: s.nullable(s.string("The ShipBob application name for the channel.")),
  scopes: s.array("The scopes granted to this ShipBob channel.", s.string("One ShipBob scope.")),
  raw: s.looseObject("The raw channel object returned by ShipBob."),
});

const inventoryQuantitySchema = s.object("A normalized ShipBob inventory quantity record.", {
  inventoryId: s.integer("The ShipBob inventory item id."),
  name: s.nullable(s.string("The inventory item name returned by ShipBob.")),
  sku: s.nullable(s.string("The stock keeping unit returned by ShipBob.")),
  totalAwaitingQuantity: s.nullable(s.integer("The total quantity expected to arrive.")),
  totalBackorderedQuantity: s.nullable(s.integer("The total quantity on backorder.")),
  totalCommittedQuantity: s.nullable(s.integer("The total quantity reserved for orders.")),
  totalExceptionQuantity: s.nullable(s.integer("The total quantity in exception status.")),
  totalFulfillableQuantity: s.nullable(s.integer("The total quantity available to fulfill.")),
  totalInternalTransferQuantity: s.nullable(s.integer("The total quantity currently in internal transfer.")),
  totalOnHandQuantity: s.nullable(s.integer("The total quantity physically on hand.")),
  totalSellableQuantity: s.nullable(s.integer("The total quantity available for sale.")),
  raw: s.looseObject("The raw inventory quantity object returned by ShipBob."),
});

const locationSchema = s.object("A normalized ShipBob location.", {
  id: s.integer("The ShipBob location id."),
  name: s.nullable(s.string("The ShipBob location name.")),
  abbreviation: s.nullable(s.string("The ShipBob location abbreviation.")),
  isActive: s.nullable(s.boolean("Whether this location is active.")),
  accessGranted: s.nullable(s.boolean("Whether the authenticated merchant can access it.")),
  isReceivingEnabled: s.nullable(s.boolean("Whether the location can receive inventory.")),
  isShippingEnabled: s.nullable(s.boolean("Whether the location can ship inventory.")),
  raw: s.looseObject("The raw location object returned by ShipBob."),
});

const productSchema = s.looseObject("A ShipBob product object returned by the Products API.");

export const shipBobActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_channels",
    description: "List ShipBob channels available to the authenticated Personal Access Token.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for listing ShipBob channels."),
    outputSchema: s.actionOutput(
      {
        channels: s.array("The ShipBob channels returned by the API.", channelSchema),
      },
      "The response returned when listing ShipBob channels.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_inventory_levels",
    description: "List ShipBob inventory levels with optional item and product filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing ShipBob inventory levels.",
      {
        searchBy: s.nonEmptyString("Search by inventory id, inventory name, or SKU."),
        inventoryIds: s.array(
          "Specific ShipBob inventory item ids to retrieve.",
          s.positiveInteger("One ShipBob inventory item id."),
          { minItems: 1 },
        ),
        isActive: s.boolean("Whether to return only active or inactive inventory items."),
        isDigital: s.boolean("Whether to return only digital or physical inventory items."),
        pageSize: pageSizeSchema,
        sortBy: sortBySchema,
      },
      { optional: ["searchBy", "inventoryIds", "isActive", "isDigital", "pageSize", "sortBy"] },
    ),
    outputSchema: s.actionOutput(
      {
        ...pageLinksSchema,
        items: s.array("The ShipBob inventory quantity records returned by the API.", inventoryQuantitySchema),
      },
      "The response returned when listing ShipBob inventory levels.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_inventory_level",
    description: "Get aggregated ShipBob inventory levels for one inventory item.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { inventoryId: s.positiveInteger("The ShipBob inventory item id to retrieve.") },
      ["inventoryId"],
      "The input payload for getting one ShipBob inventory level record.",
    ),
    outputSchema: s.actionOutput(
      { item: inventoryQuantitySchema },
      "The response returned when getting one ShipBob inventory level record.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List ShipBob products with optional catalog filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing ShipBob products.",
      {
        search: s.nonEmptyString("Search products by name, SKU, inventory id, or product id."),
        barcode: s.nonEmptyString("A barcode associated with a product variant."),
        barcodes: s.stringArray("Barcodes associated with product variants.", {
          minItems: 1,
          itemDescription: "One barcode.",
        }),
        categoryIds: s.array(
          "ShipBob category ids associated with products.",
          s.positiveInteger("One ShipBob category id."),
          { minItems: 1 },
        ),
        channelIds: s.array(
          "ShipBob channel ids associated with product variants.",
          s.positiveInteger("One ShipBob channel id."),
          { minItems: 1 },
        ),
        hasDigitalVariants: s.boolean("Whether products have digital variants."),
        hasVariants: s.boolean("Whether products have variants."),
        inventoryId: s.positiveInteger("A ShipBob inventory id associated with a product variant."),
        isInventorySyncEnabled: s.boolean("Whether inventory sync is enabled for variants."),
        lastUpdatedTimestamp: s.dateTime("Return products updated since this timestamp."),
        name: s.nonEmptyString("Search products or variants by name."),
        onHand: s.boolean("Whether products have inventory on hand."),
        productId: s.positiveInteger("A ShipBob product id to filter by."),
        productType: s.nonEmptyString("A ShipBob product type to filter by."),
        sellerSku: s.nonEmptyString("A seller SKU query."),
        sku: s.nonEmptyString("A ShipBob SKU query."),
        variantId: s.positiveInteger("A ShipBob variant id to filter by."),
        variantStatus: s.nonEmptyString("A ShipBob variant status to filter by."),
        pageSize: pageSizeSchema,
        sortBy: s.nonEmptyString("The ShipBob product field used to sort results."),
        sortOrder: s.stringEnum("The ShipBob product sort order.", ["ASC", "DESC"]),
      },
      {
        optional: [
          "search",
          "barcode",
          "barcodes",
          "categoryIds",
          "channelIds",
          "hasDigitalVariants",
          "hasVariants",
          "inventoryId",
          "isInventorySyncEnabled",
          "lastUpdatedTimestamp",
          "name",
          "onHand",
          "productId",
          "productType",
          "sellerSku",
          "sku",
          "variantId",
          "variantStatus",
          "pageSize",
          "sortBy",
          "sortOrder",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        ...pageLinksSchema,
        items: s.array("The ShipBob products returned by the API.", productSchema),
      },
      "The response returned when listing ShipBob products.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List ShipBob fulfillment network locations.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing ShipBob locations.",
      {
        includeInactive: s.boolean("Whether inactive ShipBob locations should be included."),
        receivingEnabled: s.boolean("Whether to return only receiving-enabled locations."),
        accessGranted: s.boolean("Whether to return only locations granted to this merchant."),
      },
      { optional: ["includeInactive", "receivingEnabled", "accessGranted"] },
    ),
    outputSchema: s.actionOutput(
      {
        locations: s.array("The ShipBob locations returned by the API.", locationSchema),
      },
      "The response returned when listing ShipBob locations.",
    ),
  }),
];
