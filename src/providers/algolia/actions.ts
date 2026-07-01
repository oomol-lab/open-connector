import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "algolia";

const indexNameSchema = s.string("The Algolia index name.", { minLength: 1 });
const objectIdSchema = s.string("The Algolia record objectID.", { minLength: 1 });
const forwardToReplicasSchema = s.boolean("Whether to forward the write operation to replicas.");
const pageSchema = s.integer("The zero-based page number.", { minimum: 0 });
const hitsPerPageSchema = s.integer("The number of hits to return per page.", { minimum: 1 });
const filtersSchema = s.string("The filter expression using Algolia's SQL-like syntax.", { minLength: 1 });
const stringArraySchema = s.array("A list of non-empty strings.", s.string("A non-empty string value.", { minLength: 1 }), {
  minItems: 1,
});
const filterValueSchema = s.string("A single filter value.", { minLength: 1 });
const nestedFilterSchema = s.anyOf("An Algolia filter expression in string or array form.", [
  filterValueSchema,
  s.array(
    "An Algolia filter array or grouped filter arrays.",
    s.anyOf([filterValueSchema, s.array("A group of OR filter values.", filterValueSchema, { minItems: 1 })]),
    { minItems: 1 },
  ),
]);
const geoPolygonSchema = s.anyOf("Polygon coordinates used to restrict the search area.", [
  s.string("The polygon encoded as a string.", { minLength: 1 }),
  s.array("A flat list of polygon coordinates.", s.number("A latitude or longitude coordinate."), {
    minItems: 6,
  }),
  s.array(
    "A list of polygon coordinate lists.",
    s.array("A single polygon coordinate list.", s.number("A latitude or longitude coordinate."), {
      minItems: 6,
    }),
    { minItems: 1 },
  ),
]);
const geoBoxSchema = s.anyOf("Bounding box coordinates used to restrict the search area.", [
  s.string("The bounding box encoded as a string.", { minLength: 1 }),
  s.array("A flat list of bounding box coordinates.", s.number("A latitude or longitude coordinate."), {
    minItems: 4,
  }),
  s.array(
    "A list of bounding box coordinate lists.",
    s.array("A single bounding box coordinate list.", s.number("A latitude or longitude coordinate."), {
      minItems: 4,
    }),
    { minItems: 1 },
  ),
]);

const searchRecordSchema = s.looseObject(
  {
    objectID: objectIdSchema,
  },
  { description: "An Algolia record or search hit." },
);

const indexSummarySchema = s.looseObject(
  {
    name: s.string("The Algolia index name."),
    entries: s.number("The number of records in the index."),
    dataSize: s.number("The size of the index data in bytes."),
    fileSize: s.number("The total size of the index files in bytes."),
    numberOfPendingTasks: s.number("The number of pending tasks for the index."),
    primary: s.string("The primary index name, when this index is a replica."),
    replicas: s.array("The configured replica index names.", s.string("A replica index name.")),
    pendingTask: s.boolean("Whether the index has a pending task."),
  },
  { description: "A summary of an Algolia index." },
);

const searchResponseSchema = s.looseObject(
  {
    hits: s.array("The search hits returned by Algolia.", searchRecordSchema),
    nbHits: s.number("The total number of matching hits."),
    page: s.number("The zero-based page number in the response."),
    nbPages: s.number("The total number of pages."),
    hitsPerPage: s.number("The number of hits returned per page."),
    processingTimeMS: s.number("The time the server took to process the request, in milliseconds."),
    exhaustiveNbHits: s.boolean("Whether the reported hit count is exhaustive."),
    query: s.string("The query used for the search."),
    params: s.string("The URL-encoded request parameters."),
    facets: s.looseObject({}, { description: "Facet counts returned by Algolia." }),
    facetStats: s.looseObject({}, { description: "Facet statistics returned by Algolia." }),
  },
  { description: "An Algolia search response." },
);

const browseResponseSchema = s.looseObject(
  {
    hits: s.array("The records returned by the browse request.", searchRecordSchema),
    cursor: s.string("The cursor to continue browsing from the next page."),
    nbHits: s.number("The total number of matching records, when available."),
    processingTimeMS: s.number("The time the server took to process the request, in milliseconds."),
  },
  { description: "An Algolia browse response." },
);

const taskAckSchema = s.looseObject(
  {
    taskID: s.number("The Algolia task identifier."),
    objectID: objectIdSchema,
  },
  { description: "The task acknowledgement returned by Algolia." },
);

const bodyWithObjectIdSchema = (description: string): JsonSchema =>
  s.looseObject(
    {
      objectID: objectIdSchema,
    },
    { description },
  );

export const algoliaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_indices",
    description: "List Algolia indices accessible to the current API key.",
    requiredScopes: ["listIndexes"],
    providerPermissions: ["listIndexes"],
    inputSchema: s.object(
      "The input payload for listing Algolia indices.",
      {
        page: pageSchema,
        hitsPerPage: hitsPerPageSchema,
      },
      { optional: ["page", "hitsPerPage"] },
    ),
    outputSchema: s.looseObject(
      {
        items: s.array("The list of index summaries.", indexSummarySchema),
        page: s.number("The zero-based page number in the response."),
        nbPages: s.number("The total number of pages."),
      },
      { description: "The response returned when listing Algolia indices." },
    ),
  }),
  defineProviderAction(service, {
    name: "search_index",
    description: "Search a single Algolia index with the most common search parameters.",
    requiredScopes: ["search"],
    providerPermissions: ["search"],
    inputSchema: s.object(
      "The input payload for searching a single Algolia index.",
      {
        indexName: indexNameSchema,
        query: s.string("The search query string."),
        page: pageSchema,
        hitsPerPage: hitsPerPageSchema,
        filters: filtersSchema,
        facetFilters: nestedFilterSchema,
        numericFilters: nestedFilterSchema,
        tagFilters: nestedFilterSchema,
        facets: stringArraySchema,
        attributesToRetrieve: stringArraySchema,
        attributesToHighlight: stringArraySchema,
        attributesToSnippet: stringArraySchema,
        aroundLatLng: s.string("The geolocation point in `lat,lng` form."),
        aroundRadius: s.anyOf("The geolocation radius restriction.", [
          s.integer("The radius in meters.", { minimum: 0 }),
          s.literal("all", { description: "Disable the around radius limit." }),
        ]),
        insideBoundingBox: geoBoxSchema,
        insidePolygon: geoPolygonSchema,
        clickAnalytics: s.boolean("Whether to include click analytics information."),
        analytics: s.boolean("Whether to send the search to Algolia analytics."),
        getRankingInfo: s.boolean("Whether to include ranking information in the response."),
        sumOrFiltersScores: s.boolean("Whether to sum OR filter scores instead of taking the maximum."),
      },
      {
        optional: [
          "query",
          "page",
          "hitsPerPage",
          "filters",
          "facetFilters",
          "numericFilters",
          "tagFilters",
          "facets",
          "attributesToRetrieve",
          "attributesToHighlight",
          "attributesToSnippet",
          "aroundLatLng",
          "aroundRadius",
          "insideBoundingBox",
          "insidePolygon",
          "clickAnalytics",
          "analytics",
          "getRankingInfo",
          "sumOrFiltersScores",
        ],
      },
    ),
    outputSchema: searchResponseSchema,
  }),
  defineProviderAction(service, {
    name: "browse_index",
    description: "Browse records from a single Algolia index, optionally continuing with a cursor.",
    requiredScopes: ["browse"],
    providerPermissions: ["browse"],
    inputSchema: s.object(
      "The input payload for browsing an Algolia index.",
      {
        indexName: indexNameSchema,
        cursor: s.string("The cursor returned by the previous browse response."),
        query: s.string("An optional browse query string."),
        filters: filtersSchema,
        facetFilters: nestedFilterSchema,
        numericFilters: nestedFilterSchema,
        tagFilters: nestedFilterSchema,
        attributesToRetrieve: stringArraySchema,
        hitsPerPage: hitsPerPageSchema,
      },
      {
        optional: [
          "cursor",
          "query",
          "filters",
          "facetFilters",
          "numericFilters",
          "tagFilters",
          "attributesToRetrieve",
          "hitsPerPage",
        ],
      },
    ),
    outputSchema: browseResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_record",
    description: "Retrieve a single record from an Algolia index by objectID.",
    requiredScopes: ["search"],
    providerPermissions: ["search"],
    inputSchema: s.object(
      "The input payload for retrieving a single Algolia record.",
      {
        indexName: indexNameSchema,
        objectID: objectIdSchema,
        attributesToRetrieve: stringArraySchema,
      },
      { optional: ["attributesToRetrieve"] },
    ),
    outputSchema: searchRecordSchema,
  }),
  defineProviderAction(service, {
    name: "add_or_replace_record",
    description: "Add a new record or replace an existing Algolia record using its objectID.",
    requiredScopes: ["addObject"],
    providerPermissions: ["addObject"],
    inputSchema: s.object(
      "The input payload for adding or replacing an Algolia record.",
      {
        indexName: indexNameSchema,
        record: bodyWithObjectIdSchema("The Algolia record payload."),
        forwardToReplicas: forwardToReplicasSchema,
      },
      { optional: ["forwardToReplicas"] },
    ),
    outputSchema: taskAckSchema,
  }),
  defineProviderAction(service, {
    name: "update_record_partially",
    description: "Partially update an existing Algolia record by objectID.",
    requiredScopes: ["addObject"],
    providerPermissions: ["addObject"],
    inputSchema: s.object(
      "The input payload for partially updating an Algolia record.",
      {
        indexName: indexNameSchema,
        objectID: objectIdSchema,
        attributesToUpdate: s.looseObject({}, { description: "The partial Algolia record attributes to update." }),
        createIfNotExists: s.boolean("Whether to create the record if it doesn't exist."),
        forwardToReplicas: forwardToReplicasSchema,
      },
      { optional: ["createIfNotExists", "forwardToReplicas"] },
    ),
    outputSchema: taskAckSchema,
  }),
  defineProviderAction(service, {
    name: "delete_records_by_filter",
    description: "Delete Algolia records that match a filter expression.",
    requiredScopes: ["deleteIndex"],
    providerPermissions: ["deleteIndex"],
    inputSchema: s.object("The input payload for deleting Algolia records by filter.", {
      indexName: indexNameSchema,
      filters: s.string("The filter expression used to select records to delete.", { minLength: 1 }),
    }),
    outputSchema: taskAckSchema,
  }),
  defineProviderAction(service, {
    name: "save_rule",
    description: "Save a single Algolia rule by objectID.",
    requiredScopes: ["settings"],
    providerPermissions: ["settings"],
    inputSchema: s.object(
      "The input payload for saving a single Algolia rule.",
      {
        indexName: indexNameSchema,
        rule: bodyWithObjectIdSchema("The Algolia rule payload."),
        forwardToReplicas: forwardToReplicasSchema,
      },
      { optional: ["forwardToReplicas"] },
    ),
    outputSchema: taskAckSchema,
  }),
  defineProviderAction(service, {
    name: "save_synonym",
    description: "Save a single Algolia synonym by objectID.",
    requiredScopes: ["settings"],
    providerPermissions: ["settings"],
    inputSchema: s.object(
      "The input payload for saving a single Algolia synonym.",
      {
        indexName: indexNameSchema,
        synonym: bodyWithObjectIdSchema("The Algolia synonym payload."),
        forwardToReplicas: forwardToReplicasSchema,
      },
      { optional: ["forwardToReplicas"] },
    ),
    outputSchema: taskAckSchema,
  }),
];

export type AlgoliaActionName = (typeof algoliaActions)[number]["name"];
