import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "metabase";

const emptyInputSchema = s.object("No input parameters are required.", {});
const entitySchema = s.looseObject("A Metabase entity object.");
const rawResponseSchema = s.looseObject("The raw Metabase API response object.");
const entityIdSchema = s.anyOf("A Metabase numeric ID or entity ID string.", [
  s.positiveInteger("A positive numeric Metabase ID."),
  s.string("A Metabase entity ID string.", { minLength: 1 }),
]);
const searchModelSchema = s.stringEnum("Metabase model type to include in search results.", [
  "dashboard",
  "table",
  "dataset",
  "segment",
  "collection",
  "measure",
  "transform",
  "document",
  "database",
  "action",
  "indexed-entity",
  "metric",
  "card",
]);

export const metabaseActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the Metabase user associated with the API key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Output payload for the current Metabase user.", {
      user: entitySchema,
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_databases",
    operationType: "read",
    description: "List Metabase databases visible to the API key.",
    inputSchema: s.object(
      "Query parameters for listing Metabase databases.",
      {
        include: s.stringEnum("Related database data to include.", ["tables", "schemas"]),
        includeAnalytics: s.boolean("Whether to include analytics database metadata."),
        saved: s.boolean("Whether to return saved query databases."),
        includeEditableDataModel: s.boolean("Whether to include editable data model metadata."),
        excludeUneditableDetails: s.boolean("Whether to exclude details the API key cannot edit."),
        includeOnlyUploadable: s.boolean("Whether to return only uploadable databases."),
        routerDatabaseId: s.positiveInteger("Router database ID to filter by."),
        canQuery: s.boolean("Whether to return databases the API key can query."),
        canWriteMetadata: s.boolean("Whether to return databases the API key can edit metadata for."),
      },
      {
        optional: [
          "include",
          "includeAnalytics",
          "saved",
          "includeEditableDataModel",
          "excludeUneditableDetails",
          "includeOnlyUploadable",
          "routerDatabaseId",
          "canQuery",
          "canWriteMetadata",
        ],
      },
    ),
    outputSchema: s.object("Output payload for Metabase databases.", {
      databases: s.array("Metabase databases returned by the API.", entitySchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_database",
    operationType: "read",
    description: "Retrieve one Metabase database by ID.",
    inputSchema: s.object(
      "Input parameters for retrieving one Metabase database.",
      {
        id: entityIdSchema,
        include: s.stringEnum("Related database data to include.", ["tables", "tables.fields"]),
        includeEditableDataModel: s.boolean("Whether to include editable data model metadata."),
        excludeUneditableDetails: s.boolean("Whether to exclude details the API key cannot edit."),
      },
      { optional: ["include", "includeEditableDataModel", "excludeUneditableDetails"] },
    ),
    outputSchema: s.object("Output payload for one Metabase database.", {
      database: entitySchema,
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_collections",
    operationType: "read",
    description: "List Metabase collections visible to the API key.",
    inputSchema: s.object(
      "Query parameters for listing Metabase collections.",
      {
        archived: s.boolean("Whether to include archived collections."),
        excludeOtherUserCollections: s.boolean("Whether to exclude other users' personal collections."),
        namespace: s.string("Collection namespace to filter by.", { minLength: 1 }),
        personalOnly: s.boolean("Whether to return only personal collections."),
      },
      { optional: ["archived", "excludeOtherUserCollections", "namespace", "personalOnly"] },
    ),
    outputSchema: s.object("Output payload for Metabase collections.", {
      collections: s.array("Metabase collections returned by the API.", entitySchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    operationType: "read",
    description: "Retrieve one Metabase collection by ID.",
    inputSchema: s.object("Input parameters for retrieving one Metabase collection.", {
      id: entityIdSchema,
    }),
    outputSchema: s.object("Output payload for one Metabase collection.", {
      collection: entitySchema,
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_cards",
    operationType: "read",
    description: "List Metabase cards, also known as questions.",
    inputSchema: s.object(
      "Query parameters for listing Metabase cards.",
      {
        filter: s.stringEnum("Card list filter.", [
          "archived",
          "table",
          "using_model",
          "bookmarked",
          "using_segment",
          "all",
          "mine",
          "database",
        ]),
        modelId: s.positiveInteger("Model ID to filter cards by."),
      },
      { optional: ["filter", "modelId"] },
    ),
    outputSchema: s.object("Output payload for Metabase cards.", {
      cards: s.array("Metabase cards returned by the API.", entitySchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_card",
    operationType: "read",
    description: "Retrieve one Metabase card by ID.",
    inputSchema: s.object(
      "Input parameters for retrieving one Metabase card.",
      {
        id: entityIdSchema,
        legacyMbql: s.boolean("Whether to request the legacy MBQL response shape."),
      },
      { optional: ["legacyMbql"] },
    ),
    outputSchema: s.object("Output payload for one Metabase card.", {
      card: entitySchema,
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_dashboards",
    operationType: "read",
    description: "List Metabase dashboards visible to the API key.",
    inputSchema: s.object(
      "Query parameters for listing Metabase dashboards.",
      { filter: s.stringEnum("Dashboard list filter.", ["all", "mine", "archived"]) },
      { optional: ["filter"] },
    ),
    outputSchema: s.object("Output payload for Metabase dashboards.", {
      dashboards: s.array("Metabase dashboards returned by the API.", entitySchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_dashboard",
    operationType: "read",
    description: "Retrieve one Metabase dashboard by ID.",
    inputSchema: s.object("Input parameters for retrieving one Metabase dashboard.", {
      id: entityIdSchema,
    }),
    outputSchema: s.object("Output payload for one Metabase dashboard.", {
      dashboard: entitySchema,
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Search Metabase content visible to the API key.",
    inputSchema: s.object(
      "Query parameters for searching Metabase content.",
      {
        query: s.string("Search text.", { minLength: 1 }),
        context: s.stringEnum("Metabase search context.", [
          "search-bar",
          "search-app",
          "command-palette",
          "entity-picker",
          "data-picker",
          "type-filter",
          "basic-actions",
          "browse",
          "embedding-setup",
          "document",
          "library",
          "dependencies",
          "model-migration",
          "api",
          "metabot",
        ]),
        archived: s.boolean("Whether to search archived content."),
        collectionId: s.positiveInteger("Collection ID to search within."),
        tableDatabaseId: s.positiveInteger("Database ID to filter table search results by."),
        models: s.array("Metabase model types to include.", searchModelSchema),
        includeDashboardQuestions: s.boolean("Whether to include dashboard questions."),
        includeMetadata: s.boolean("Whether to include result metadata."),
      },
      {
        optional: [
          "query",
          "context",
          "archived",
          "collectionId",
          "tableDatabaseId",
          "models",
          "includeDashboardQuestions",
          "includeMetadata",
        ],
      },
    ),
    outputSchema: s.object("Output payload for Metabase search results.", {
      results: s.array("Metabase search results returned by the API.", entitySchema),
      raw: rawResponseSchema,
    }),
  }),
];
