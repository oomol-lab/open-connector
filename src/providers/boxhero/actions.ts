import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "boxhero";

const nonNegativeIntegerField = (description: string) => s.integer(description, { minimum: 0 });

const nullableStringField = (description: string) => s.nullable(s.string(description));

const itemAttributeTypeSchema = s.stringEnum("The BoxHero attribute type assigned to the item attribute.", [
  "text",
  "date",
  "number",
  "barcode",
]);

const itemAttributeValueSchema = s.anyOf("The item attribute value.", [
  s.string("A string item attribute value."),
  s.number("A numeric item attribute value."),
]);

const itemAttributeSchema = s.object("A BoxHero item attribute entry.", {
  id: nonNegativeIntegerField("The unique identifier of the item attribute specification."),
  type: itemAttributeTypeSchema,
  name: s.string("The BoxHero item attribute name."),
  value: itemAttributeValueSchema,
});

const locationQuantitySchema = s.object("The item quantity for a single BoxHero location.", {
  location_id: nonNegativeIntegerField("The unique identifier of the location."),
  quantity: s.number("The item quantity for the specified location."),
});

const teamModeSchema = s.oneOf(
  [
    s.literal(0, { description: "Basic team mode." }),
    s.literal(1, { description: "Unit team mode." }),
    s.literal(2, { description: "Location team mode." }),
  ],
  { description: "The linked BoxHero team mode." },
);

const teamSchema = s.object("The linked BoxHero team.", {
  id: nonNegativeIntegerField("The unique identifier of the BoxHero team."),
  name: s.string("The BoxHero team name."),
  mode: teamModeSchema,
  currency_symbol: nullableStringField("The currency symbol configured for the team."),
  memo: nullableStringField("The notes stored for the team."),
});

const getTeamInfoInputSchema = s.object("Input parameters for retrieving the linked BoxHero team.", {});

const getTeamInfoOutputSchema = s.object("The BoxHero linked team response.", {
  item: teamSchema,
});

const itemIdsField = s.array(
  "The item identifiers to filter by.",
  nonNegativeIntegerField("A BoxHero item identifier used to filter the request."),
  { minItems: 1 },
);

const locationIdsField = s.array(
  "The location identifiers used to calculate quantity.",
  nonNegativeIntegerField("A BoxHero location identifier used to filter the request."),
  { minItems: 1 },
);

const listItemsInputSchema = s.object(
  "Input parameters for listing BoxHero items.",
  {
    item_ids: itemIdsField,
    location_ids: locationIdsField,
    cursor: nonNegativeIntegerField("The cursor returned by a previous BoxHero list_items response."),
    limit: s.integer("The maximum number of items to return.", { minimum: 1, maximum: 100 }),
  },
  { optional: ["item_ids", "location_ids", "cursor", "limit"] },
);

const itemSummarySchema = s.object(
  "A BoxHero item summary.",
  {
    id: nonNegativeIntegerField("The unique identifier of the BoxHero item."),
    name: s.string("The BoxHero item name."),
    sku: s.string("The BoxHero item SKU."),
    barcode: s.string("The barcode assigned to the BoxHero item."),
    photo_url: nullableStringField("The URL of the BoxHero item photo."),
    attrs: s.array("The attributes assigned to the BoxHero item.", itemAttributeSchema),
    cost: s.string("The BoxHero item purchase cost."),
    price: s.string("The BoxHero item sale price."),
    quantity: s.number("The total BoxHero item quantity."),
    quantities: s.array("The BoxHero item quantity for each requested location.", locationQuantitySchema),
  },
  { optional: ["attrs", "cost", "price", "quantities"] },
);

const listItemsOutputSchema = s.object(
  "The BoxHero list items response.",
  {
    items: s.array("The BoxHero items returned for the current page.", itemSummarySchema),
    count: s.number("The number of BoxHero items in the current response."),
    limit: s.number("The page size returned by BoxHero."),
    cursor: s.nullable(nonNegativeIntegerField("The cursor for the next page of BoxHero items.")),
    has_more: s.boolean("Whether BoxHero has more items after the current page."),
  },
  { optional: ["limit"] },
);

const getItemInputSchema = s.object(
  "Input parameters for retrieving a single BoxHero item.",
  {
    item_id: nonNegativeIntegerField("The BoxHero item identifier."),
    location_ids: locationIdsField,
  },
  { optional: ["location_ids"] },
);

const getItemOutputSchema = s.object("The BoxHero single item response.", {
  item: itemSummarySchema,
});

const locationSchema = s.object("A BoxHero location.", {
  id: nonNegativeIntegerField("The unique identifier of the BoxHero location."),
  name: s.string("The BoxHero location name."),
  quantity: s.number("The total quantity currently stored at the BoxHero location."),
  memo: s.string("The notes stored for the BoxHero location."),
});

const listLocationsInputSchema = s.object("Input parameters for listing BoxHero locations.", {});

const listLocationsOutputSchema = s.object("The BoxHero list locations response.", {
  items: s.array("The BoxHero locations returned by the request.", locationSchema),
  count: s.number("The number of BoxHero locations in the response."),
});

export const boxheroActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_team_info",
    description: "Get the linked BoxHero team information and team mode.",
    inputSchema: getTeamInfoInputSchema,
    outputSchema: getTeamInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_items",
    description: "List BoxHero inventory items with optional location filters and cursor pagination.",
    inputSchema: listItemsInputSchema,
    outputSchema: listItemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get a single BoxHero inventory item by item identifier.",
    inputSchema: getItemInputSchema,
    outputSchema: getItemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List BoxHero locations available to the linked team.",
    inputSchema: listLocationsInputSchema,
    outputSchema: listLocationsOutputSchema,
  }),
];
