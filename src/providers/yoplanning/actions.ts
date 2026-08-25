import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "yoplanning";
const pagination: Record<string, JsonSchema> = {
  limit: s.integer("The maximum number of results to return, from 1 to 100.", { minimum: 1, maximum: 100 }),
  offset: s.nonNegativeInteger("The zero-based result offset."),
};
const language = s.string("The ISO 639-1 language code used for translated product content.", {
  minLength: 2,
  maxLength: 2,
});
const team = s.looseRequiredObject("A YoPlanning team returned by the API.", {
  id: s.uuid("The YoPlanning team ID."),
  name: s.string("The YoPlanning team name."),
});
const onlineProduct = s.looseRequiredObject("A YoPlanning online product returned by the API.", {
  id: s.uuid("The YoPlanning online product ID."),
  name: s.string("The internal YoPlanning product name."),
  team: s.uuid("The YoPlanning team ID that owns the product."),
});
const availability = s.looseRequiredObject(
  "A YoPlanning product availability returned by the API.",
  {
    start_date: s.dateTime("The availability start date-time."),
    end_date: s.dateTime("The availability end date-time."),
    session_group: s.uuid("The session group ID used to read availability details."),
  },
  { optional: ["session_group"] },
);
const availabilityDetails = s.looseRequiredObject("Bookable options and resources for a YoPlanning availability.", {
  id: s.uuid("The YoPlanning session group ID."),
});

function paginatedOutput(description: string, itemDescription: string, itemSchema: JsonSchema): JsonSchema {
  return s.actionOutput(
    {
      count: s.integer("The total number of matching resources."),
      next: s.nullable(s.url("The URL of the next pagination page, or null when no page is available.")),
      previous: s.nullable(s.url("The URL of the previous pagination page, or null when no page is available.")),
      results: s.array(itemDescription, itemSchema),
    },
    description,
  );
}

export const yoplanningActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_teams",
    description: "List the YoPlanning teams accessible to the authenticated API token.",
    followUpActions: ["yoplanning.get_team"],
    inputSchema: s.actionInput(pagination, [], "Input payload for listing accessible YoPlanning teams."),
    outputSchema: paginatedOutput(
      "A paginated list of accessible YoPlanning teams.",
      "The YoPlanning teams returned for this page.",
      team,
    ),
  }),
  defineProviderAction(service, {
    name: "get_team",
    description: "Get one YoPlanning team by its ID.",
    followUpActions: ["yoplanning.list_online_products"],
    inputSchema: s.actionInput({ teamId: s.uuid("The YoPlanning team ID.") }, ["teamId"]),
    outputSchema: s.actionOutput({ team: s.describe(team, "The YoPlanning team returned by the API.") }),
  }),
  defineProviderAction(service, {
    name: "list_online_products",
    description: "List products that a YoPlanning team currently offers for online sale.",
    followUpActions: ["yoplanning.get_online_product", "yoplanning.list_product_availabilities"],
    inputSchema: s.actionInput(
      {
        teamId: s.uuid("The YoPlanning team ID."),
        ...pagination,
        language,
        startDate: s.date("Return products with availability on or after this ISO 8601 date."),
        endDate: s.date("Return products with availability on or before this ISO 8601 date."),
        subCategoryId: s.integer("The YoPlanning subcategory ID used to filter products."),
      },
      ["teamId"],
      "Input payload for listing a team's online products.",
    ),
    outputSchema: paginatedOutput(
      "A paginated list of online products.",
      "The online products returned for this page.",
      onlineProduct,
    ),
  }),
  defineProviderAction(service, {
    name: "get_online_product",
    description: "Get one online product offered by a YoPlanning team.",
    followUpActions: ["yoplanning.list_product_availabilities"],
    inputSchema: s.actionInput(
      { teamId: s.uuid("The YoPlanning team ID."), productId: s.uuid("The YoPlanning online product ID.") },
      ["teamId", "productId"],
    ),
    outputSchema: s.actionOutput({
      product: s.describe(onlineProduct, "The online product returned by the API."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_product_availabilities",
    description: "List bookable availability slots for one YoPlanning online product.",
    followUpActions: ["yoplanning.get_availability_details"],
    inputSchema: s.actionInput(
      {
        teamId: s.uuid("The YoPlanning team ID."),
        productId: s.uuid("The YoPlanning online product ID."),
        ...pagination,
        startDateAfter: s.dateTime("Return slots starting after this ISO 8601 date-time."),
        startDateBefore: s.dateTime("Return slots starting before this ISO 8601 date-time."),
        status: s.stringEnum("Whether to return only active slots or include deleted slots.", ["created", "all"]),
      },
      ["teamId", "productId"],
    ),
    outputSchema: paginatedOutput(
      "A paginated list of product availability slots.",
      "The availability slots returned for this page.",
      availability,
    ),
  }),
  defineProviderAction(service, {
    name: "get_availability_details",
    description: "Get the currently bookable options and resources for a YoPlanning availability.",
    inputSchema: s.actionInput(
      {
        teamId: s.uuid("The YoPlanning team ID."),
        availabilityId: s.uuid("The session group ID returned by a product availability."),
        language,
      },
      ["teamId", "availabilityId"],
    ),
    outputSchema: s.actionOutput({
      availability: s.describe(availabilityDetails, "The bookable options and resources returned by the API."),
    }),
  }),
];
