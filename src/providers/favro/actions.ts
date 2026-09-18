import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "favro";

const entitySchema = s.looseObject("A Favro API entity.");
const descriptionFormatSchema = s.stringEnum("Card description format.", ["plaintext", "markdown"]);
const paginationInputProperties = {
  requestId: s.nonEmptyString("Request identifier returned by the first page."),
  page: s.integer("Zero-based page index to retrieve.", { minimum: 0 }),
  backendIdentifier: s.nonEmptyString(
    "Favro backend identifier returned by the first page for routing continuation requests.",
  ),
};
const paginationOutputProperties = {
  requestId: s.nonEmptyString("Request identifier used to retrieve subsequent pages."),
  page: s.integer("Zero-based page index returned by Favro."),
  pages: s.integer("Total number of available pages."),
  limit: s.integer("Maximum number of entities in this page."),
  backendIdentifier: s.nullable(s.string("Favro backend identifier required when retrieving subsequent pages.")),
};

function paginatedOutputSchema(description: string, property: string, itemDescription: string) {
  return s.object(description, {
    [property]: s.array(itemDescription, entitySchema),
    ...paginationOutputProperties,
  });
}

export const favroActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    operationType: "read",
    description: "List Favro organizations accessible to the configured user and API token.",
    requiredScopes: [],
    inputSchema: s.object("Continuation data for listing Favro organizations.", paginationInputProperties, {
      optional: ["requestId", "page", "backendIdentifier"],
    }),
    outputSchema: paginatedOutputSchema(
      "A page of Favro organizations.",
      "organizations",
      "Organizations returned for this page.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    operationType: "read",
    description: "Retrieve the Favro organization configured for this connection.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The configured Favro organization.", { organization: entitySchema }),
  }),
  defineProviderAction(service, {
    name: "list_collections",
    operationType: "read",
    description: "List collections in the configured Favro organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and continuation data for listing Favro collections.",
      {
        archived: s.boolean("Whether to return archived collections."),
        ...paginationInputProperties,
      },
      { optional: ["archived", "requestId", "page", "backendIdentifier"] },
    ),
    outputSchema: paginatedOutputSchema(
      "A page of Favro collections.",
      "collections",
      "Collections returned for this page.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_widgets",
    operationType: "read",
    description: "List boards and other widgets in the configured Favro organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and continuation data for listing Favro widgets.",
      {
        collectionId: s.nonEmptyString("Collection identifier used to filter widgets."),
        archived: s.boolean("Whether to return archived widgets."),
        ...paginationInputProperties,
      },
      {
        optional: ["collectionId", "archived", "requestId", "page", "backendIdentifier"],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of Favro widgets.", "widgets", "Widgets returned for this page."),
  }),
  defineProviderAction(service, {
    name: "get_widget",
    operationType: "read",
    description: "Retrieve a Favro board or other widget by its common identifier.",
    requiredScopes: [],
    inputSchema: s.object("The widget to retrieve.", {
      widgetCommonId: s.nonEmptyString("Common identifier of the widget to retrieve."),
    }),
    outputSchema: s.object("The matching Favro widget.", { widget: entitySchema }),
  }),
  defineProviderAction(service, {
    name: "list_cards",
    operationType: "read",
    description: "List Favro cards using a documented board, collection, card, or todo filter.",
    requiredScopes: [],
    inputSchema: s.object(
      "Card filters and continuation data. At least one card filter is required.",
      {
        todoList: s.boolean("Whether to return cards from the user's todo list."),
        cardCommonId: s.nonEmptyString("Common card identifier used to filter results."),
        cardSequentialId: s.nonEmptyString("Sequential card identifier used to filter results."),
        widgetCommonId: s.nonEmptyString("Widget common identifier used to filter cards."),
        columnId: s.nonEmptyString("Column identifier used to filter cards."),
        collectionId: s.nonEmptyString("Collection identifier used to filter cards."),
        unique: s.boolean("Whether to return unique cards only."),
        archived: s.boolean("Whether to return archived cards."),
        descriptionFormat: descriptionFormatSchema,
        ...paginationInputProperties,
      },
      {
        optional: [
          "todoList",
          "cardCommonId",
          "cardSequentialId",
          "widgetCommonId",
          "columnId",
          "collectionId",
          "unique",
          "archived",
          "descriptionFormat",
          "requestId",
          "page",
          "backendIdentifier",
        ],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of Favro cards.", "cards", "Cards returned for this page."),
  }),
  defineProviderAction(service, {
    name: "get_card",
    operationType: "read",
    description: "Retrieve one Favro card by its card identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "The card to retrieve and its desired description format.",
      {
        cardId: s.nonEmptyString("Identifier of the card to retrieve."),
        descriptionFormat: descriptionFormatSchema,
      },
      { optional: ["descriptionFormat"] },
    ),
    outputSchema: s.object("The matching Favro card.", { card: entitySchema }),
  }),
  defineProviderAction(service, {
    name: "create_card",
    operationType: "write",
    description: "Create a Favro card in a board or in the configured user's todo list.",
    requiredScopes: [],
    inputSchema: s.object(
      "Fields for a new Favro card.",
      {
        name: s.nonEmptyString("Name of the new card."),
        widgetCommonId: s.nonEmptyString("Widget where the card should be created."),
        laneId: s.nonEmptyString("Lane where the card should be created."),
        columnId: s.nonEmptyString("Column where the card should be created."),
        detailedDescription: s.string("Detailed card description."),
        tags: s.array("Tag names to add to the card.", s.nonEmptyString("Tag name.")),
        startDate: s.string("Card start date in ISO 8601 format.", { format: "date-time" }),
        dueDate: s.string("Card due date in ISO 8601 format.", { format: "date-time" }),
        descriptionFormat: descriptionFormatSchema,
      },
      {
        optional: [
          "widgetCommonId",
          "laneId",
          "columnId",
          "detailedDescription",
          "tags",
          "startDate",
          "dueDate",
          "descriptionFormat",
        ],
      },
    ),
    outputSchema: s.object("The created Favro card.", { card: entitySchema }),
  }),
  defineProviderAction(service, {
    name: "update_card",
    operationType: "write",
    description: "Update selected fields on an existing Favro card.",
    requiredScopes: [],
    inputSchema: s.object(
      "Card identifier and fields to update.",
      {
        cardId: s.nonEmptyString("Identifier of the card to update."),
        name: s.string("Updated card name."),
        detailedDescription: s.string("Updated detailed card description."),
        widgetCommonId: s.nonEmptyString("Widget where the card should be moved."),
        laneId: s.nonEmptyString("Lane where the card should be moved."),
        columnId: s.nonEmptyString("Column where the card should be moved."),
        startDate: s.nullable(s.string("Updated card start date in ISO 8601 format.", { format: "date-time" })),
        dueDate: s.nullable(s.string("Updated card due date in ISO 8601 format.", { format: "date-time" })),
        archived: s.boolean("Whether the card should be archived."),
        descriptionFormat: descriptionFormatSchema,
      },
      {
        optional: [
          "name",
          "detailedDescription",
          "widgetCommonId",
          "laneId",
          "columnId",
          "startDate",
          "dueDate",
          "archived",
          "descriptionFormat",
        ],
      },
    ),
    outputSchema: s.object("The updated Favro card.", { card: entitySchema }),
  }),
];
