import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

// Verified against Metabase v0.63.16 agent_api/api.clj and mcp/tools.clj overrides.
// Top-level nulls are stripped by MCP, so optional inputs use omission, not clear-to-null semantics.
const id = s.positiveInteger("Metabase numeric ID.");
const name = s.nonWhitespaceString("Entity name.");
const description = s.optional(s.string("Entity description."));
const collectionId = s.optional(
  s.positiveInteger(
    "Destination collection. On creation, omission uses the API-key caller's default (root on v0.63.16); on update it leaves the collection unchanged. MCP cannot move existing content to root with null.",
  ),
);
const queryHandle = s.uuid(
  "Stored query handle from construct_query or construct_native_query. Subject to server expiry and caller ownership.",
);
const raw = s.optional(s.looseObject("Complete native MCP response, including content blocks and metadata."));
const display = s.stringEnum("Visualization display type.", [
  "table",
  "bar",
  "line",
  "pie",
  "scatter",
  "area",
  "row",
  "combo",
  "pivot",
  "scalar",
  "smartscalar",
  "gauge",
  "progress",
  "funnel",
  "map",
  "waterfall",
  "sankey",
]);
const cardOptions = {
  display: s.optional(display),
  description,
  collectionId,
  visualizationSettings: s.optional(
    s.looseObject("Native Metabase visualization settings. Keys are passed unchanged."),
  ),
};
const savedEntity = {
  id,
  name,
  collectionId: s.nullable(id),
  collectionPath: s.string("Saved collection breadcrumb."),
  description: s.nullableString("Saved description."),
};
const createdCard = s.requiredObject("Saved question or metric.", {
  ...savedEntity,
  display: s.string("Saved display type."),
  url: s.string("Metabase question URL, possibly relative."),
  raw,
});
const updatedCard = s.requiredObject("Updated question or metric.", {
  ...savedEntity,
  display: s.string("Saved display type."),
  archived: s.boolean("Whether archived."),
  raw,
});
const cardCreateInput = s.requiredObject(
  "Save a constructed query. Native SQL handles may be saved as questions, not metrics.",
  { name, queryHandle, ...cardOptions },
);
const cardUpdateInput = s.requiredObject("Patch only supplied fields. Null-clearing is not supported by native MCP.", {
  id,
  name: s.optional(name),
  queryHandle: s.optional(queryHandle),
  ...cardOptions,
  archived: s.optional(s.boolean("Archive or restore.")),
});
const nativeQueryInput = s.requiredObject("Native SQL and its target database.", {
  databaseId: id,
  sql: s.nonWhitespaceString("Raw SQL text."),
});
const queryObject = s.looseObject(
  "Portable MBQL 5 query. Discover exact names with search_content/read_resource and read metabase://docs/construct-query.md; nested native query keys are passed unchanged.",
);
const constructOutput = s.requiredObject("Constructed query handle; construction does not execute the query.", {
  queryHandle,
  raw,
});
const queryOutput = s.requiredObject("Successful query results. Tool and query failures raise provider errors.", {
  status: s.literal("completed"),
  columns: s.array(
    "Result columns in row order.",
    s.requiredObject("Column metadata.", {
      name: s.string("Column name."),
      displayName: s.string("Human-readable name."),
      baseType: s.string("Metabase base type."),
      effectiveType: s.optional(s.nullableString("Effective type.")),
    }),
  ),
  rows: s.array("Result rows.", s.array("Values in column order.", s.unknown("Cell value."))),
  rowCount: s.optional(s.nonNegativeInteger("Reported number of rows.")),
  runningTime: s.optional(s.nonNegativeInteger("Execution time in milliseconds.")),
  continuationToken: s.optional(s.string("Pass to query for the next page, when available.")),
  raw,
});
const dashcardIds = s.array("Saved dashboard-card IDs.", id);
const dashcardMutation = s.oneOf([
  s.requiredObject("Add a saved question.", {
    action: s.literal("add"),
    cardId: id,
    displaySize: s.optional(s.stringEnum("Optional layout size.", ["wide", "tall", "full"])),
  }),
  s.requiredObject("Remove a dashboard card.", { action: s.literal("remove"), dashcardId: id }),
  s.requiredObject("Move a dashboard card.", {
    action: s.literal("move"),
    dashcardId: id,
    position: s.stringEnum("Placement.", ["top", "bottom"]),
  }),
]);

export const metabaseMcpActions: ProviderActionDefinition[] = [
  defineProviderAction("metabase", {
    name: "search_content",
    description:
      "Search native Metabase MCP content using keyword or semantic queries (not the REST search action). Requires native MCP on the instance.",
    inputSchema: s.requiredObject("Native search queries.", {
      termQueries: s.optional(s.array("Keyword queries.", s.nonWhitespaceString("Keyword query."))),
      semanticQueries: s.optional(
        s.array(
          "Natural-language queries; availability depends on instance search configuration.",
          s.nonWhitespaceString("Semantic query."),
        ),
      ),
    }),
    outputSchema: s.requiredObject("Native search results.", {
      results: s.array(
        "Matching content.",
        s.requiredObject("Search match.", {
          id: s.integer("Entity ID."),
          type: s.stringEnum("Entity type.", ["table", "metric", "model", "question", "dashboard", "collection"]),
          name,
          displayName: s.optional(s.nullableString("Display name.")),
          description: s.optional(s.nullableString("Description.")),
          databaseId: s.optional(s.nullableInteger("Database ID.")),
          databaseSchema: s.optional(s.nullableString("Database schema.")),
        }),
      ),
      totalCount: s.nonNegativeInteger("Number of matches."),
      raw,
    }),
  }),
  defineProviderAction("metabase", {
    name: "read_resource",
    description:
      "Read up to five Metabase entity URIs. Preserves individual resource errors; list endpoints cap at 25 items.",
    inputSchema: s.requiredObject("Entity resource URIs.", {
      uris: s.array(
        "For example metabase://databases or metabase://table/1/fields.",
        s.nonWhitespaceString("Metabase entity URI."),
        { minItems: 1, maxItems: 5 },
      ),
    }),
    outputSchema: s.requiredObject("Entity resources and their formatted representation.", {
      resources: s.array(
        "Per-URI successes or failures.",
        s.requiredObject("Resource outcome.", {
          uri: s.string("Requested URI."),
          content: s.optional(s.unknown("Resource content; shape depends on URI.")),
          error: s.optional(s.string("Per-resource error.")),
        }),
      ),
      output: s.string("Native formatted XML representation."),
      raw,
    }),
  }),
  defineProviderAction("metabase", {
    name: "construct_query",
    description: "Construct portable MBQL 5 without executing it; returns a stored query handle.",
    inputSchema: s.requiredObject("Structured query construction.", {
      query: queryObject,
      prompt: s.optional(s.string("Exact original user message, if available.", { minLength: 1, maxLength: 10000 })),
    }),
    outputSchema: constructOutput,
  }),
  defineProviderAction("metabase", {
    name: "construct_native_query",
    description:
      "Construct SQL for saving as a question. This handle cannot be run by execute_query or query; use execute_sql to execute SQL.",
    inputSchema: nativeQueryInput,
    outputSchema: constructOutput,
  }),
  defineProviderAction("metabase", {
    name: "query",
    description:
      "Execute MBQL or fetch its next page. Native MCP returns pages of 200 rows within a 2,000-row total budget.",
    inputSchema: s.requireAnyProperty(
      s.requiredObject("Supply exactly one query, queryHandle, or continuationToken.", {
        query: s.optional(queryObject),
        queryHandle: s.optional(queryHandle),
        continuationToken: s.optional(s.nonWhitespaceString("Token from a previous query page.")),
      }),
      ["query", "queryHandle", "continuationToken"],
    ),
    outputSchema: queryOutput,
  }),
  defineProviderAction("metabase", {
    name: "execute_query",
    description: "Execute constructed MBQL and return rows and columns. Native SQL handles are not supported.",
    inputSchema: s.requireAnyProperty(
      s.requiredObject("Supply exactly one handle or base64-encoded MBQL query.", {
        queryHandle: s.optional(queryHandle),
        query: s.optional(s.nonWhitespaceString("Base64-encoded MBQL query; prefer queryHandle.")),
      }),
      ["queryHandle", "query"],
    ),
    outputSchema: queryOutput,
  }),
  defineProviderAction("metabase", {
    name: "execute_sql",
    description:
      "Execute native SQL. Requires native-query permission and the instance's execute-SQL setting to be enabled.",
    inputSchema: nativeQueryInput,
    outputSchema: queryOutput,
  }),
  defineProviderAction("metabase", {
    name: "execute_question",
    description:
      "Run a saved question. Parameterized questions and input template tags are not supported by native MCP.",
    inputSchema: s.requiredObject("Saved question.", { id }),
    outputSchema: queryOutput,
  }),
  defineProviderAction("metabase", {
    name: "create_question",
    description: "Save a constructed MBQL or SQL query as a question.",
    inputSchema: cardCreateInput,
    outputSchema: createdCard,
  }),
  defineProviderAction("metabase", {
    name: "update_question",
    description: "Patch a saved question, optionally replacing its query with a stored handle.",
    inputSchema: cardUpdateInput,
    outputSchema: updatedCard,
  }),
  defineProviderAction("metabase", {
    name: "create_metric",
    description: "Save constructed MBQL as a metric: one aggregation and at most one date/datetime grouping.",
    inputSchema: cardCreateInput,
    outputSchema: createdCard,
  }),
  defineProviderAction("metabase", {
    name: "update_metric",
    description: "Patch a metric; replacement queries must still meet metric requirements.",
    inputSchema: cardUpdateInput,
    outputSchema: updatedCard,
  }),
  defineProviderAction("metabase", {
    name: "create_dashboard",
    description: "Create a dashboard with optional saved questions, automatically positioned.",
    inputSchema: s.requiredObject("Dashboard creation.", {
      name,
      description,
      collectionId,
      questionIds: s.optional(s.array("Questions to add.", id)),
    }),
    outputSchema: s.requiredObject("Created dashboard.", {
      ...savedEntity,
      url: s.string("Dashboard URL, possibly relative."),
      dashcardIds,
      raw,
    }),
  }),
  defineProviderAction("metabase", {
    name: "update_dashboard",
    description: "Patch a dashboard and apply ordered add/remove/move card mutations.",
    inputSchema: s.requiredObject("Dashboard patch.", {
      id,
      name: s.optional(name),
      description,
      collectionId,
      archived: s.optional(s.boolean("Archive or restore.")),
      dashcards: s.optional(s.array("Ordered dashboard-card mutations.", dashcardMutation)),
    }),
    outputSchema: s.requiredObject("Updated dashboard.", {
      ...savedEntity,
      archived: s.boolean("Whether archived."),
      dashcardIds,
      raw,
    }),
  }),
  defineProviderAction("metabase", {
    name: "create_collection",
    description: "Create a collection, optionally nested under a parent.",
    inputSchema: s.requiredObject("Collection creation.", { name, description, parentCollectionId: s.optional(id) }),
    outputSchema: s.requiredObject("Created collection.", {
      id,
      name,
      parentId: s.nullable(id),
      location: s.nonEmptyString("Materialized collection path."),
      description: s.nullableString("Description."),
      raw,
    }),
  }),
  defineProviderAction("metabase", {
    name: "list_mcp_tools",
    description:
      "Discover native MCP tools and their upstream schemas. Unknown tools are discoverable, not automatically executable.",
    inputSchema: s.object("No input required.", {}),
    outputSchema: s.requiredObject("Available native tools across all discovery pages.", {
      tools: s.array(
        "Native tools.",
        s.requiredObject("Tool definition.", {
          name: s.string("Native tool name (search maps to search_content)."),
          title: s.optional(s.string("Tool title.")),
          description: s.optional(s.string("Tool description.")),
          inputSchema: s.looseObject("Upstream JSON input schema."),
          outputSchema: s.optional(s.looseObject("Upstream JSON output schema.")),
          annotations: s.optional(s.looseObject("Native tool annotations.")),
        }),
      ),
      raw,
    }),
  }),
  defineProviderAction("metabase", {
    name: "list_mcp_resources",
    description:
      "Discover native MCP resources. Only documentation resources can be read by this connector; Apps are not supported.",
    inputSchema: s.object("No input required.", {}),
    outputSchema: s.requiredObject("Native resources across all discovery pages.", {
      resources: s.array(
        "Resource definitions.",
        s.requiredObject("Resource definition.", {
          uri: s.string("Resource URI."),
          name: s.string("Resource name."),
          title: s.optional(s.string("Title.")),
          description: s.optional(s.string("Description.")),
          mimeType: s.optional(s.string("Media type.")),
        }),
      ),
      raw,
    }),
  }),
  defineProviderAction("metabase", {
    name: "read_mcp_resource",
    description: "Read native metabase://docs/ documentation, not entities or MCP Apps resources.",
    inputSchema: s.requiredObject("Documentation resource.", {
      uri: s.string("URI from list_mcp_resources.", { pattern: "^metabase://docs/", minLength: 17 }),
    }),
    outputSchema: s.requiredObject("Documentation contents.", {
      contents: s.array(
        "Text resource contents.",
        s.requiredObject("Documentation content.", {
          uri: s.string("Resource URI."),
          mimeType: s.optional(s.string("Media type.")),
          text: s.string("Documentation text."),
        }),
      ),
      raw,
    }),
  }),
];
