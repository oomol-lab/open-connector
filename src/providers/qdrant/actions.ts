import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "qdrant";

const collectionNameSchema = {
  ...s.nonEmptyString("The Qdrant collection name. The names `.` and `..` are not supported."),
  not: { enum: [".", ".."] },
};
export const qdrantUuidPattern =
  "^(?:[0-9A-Fa-f]{32}|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}|[uU][rR][nN]:[uU][uU][iI][dD]:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$";
const pointIdSchema = s.union(
  [
    s.nonNegativeInteger("A numeric point ID within the JavaScript safe-integer range.", {
      maximum: Number.MAX_SAFE_INTEGER,
    }),
    s.stringPattern(qdrantUuidPattern, {
      description: "A Qdrant UUID point ID in simple, hyphenated, or URN form.",
    }),
  ],
  { description: "A Qdrant numeric or UUID point ID." },
);
const vectorSchema = s.array("A dense unnamed vector.", s.number("One vector component."), { minItems: 1 });
const payloadSchema = s.looseObject("A JSON object stored with the point.");
const filterSchema = s.looseObject("A Qdrant filter. Nested conditions are validated by Qdrant.", {
  must: s.unknown("Conditions that must match."),
  must_not: s.unknown("Conditions that must not match."),
  should: s.unknown("Conditions where at least one should match."),
  min_should: s.requiredObject("Conditions where at least `min_count` entries must match.", {
    conditions: s.array("The Qdrant filter conditions to evaluate.", s.unknown("One Qdrant filter condition.")),
    min_count: s.nonNegativeInteger("The minimum number of conditions that must match."),
  }),
});

const pointSchema = s.object(
  "A Qdrant point to insert or update.",
  {
    id: pointIdSchema,
    vector: vectorSchema,
    payload: payloadSchema,
  },
  { optional: ["payload"] },
);

const recordSchema = s.looseRequiredObject(
  "A Qdrant point record.",
  {
    id: pointIdSchema,
    payload: s.nullable(payloadSchema),
    vector: s.nullable(vectorSchema),
    shard_key: s.unknown("The Qdrant shard key when present."),
    order_value: s.unknown("The Qdrant order value when present."),
  },
  { optional: ["payload", "vector", "shard_key", "order_value"] },
);

const scoredPointSchema = s.looseRequiredObject(
  "A Qdrant scored point.",
  {
    id: pointIdSchema,
    version: s.nonNegativeInteger("The point version."),
    score: s.number("The similarity score."),
    payload: s.nullable(payloadSchema),
    vector: s.nullable(vectorSchema),
    shard_key: s.unknown("The Qdrant shard key when present."),
    order_value: s.unknown("The Qdrant order value when present."),
  },
  { optional: ["payload", "vector", "shard_key", "order_value"] },
);

const collectionSchema = s.looseRequiredObject(
  "A Qdrant collection description.",
  {
    status: s.unknown("The collection status."),
    optimizer_status: s.unknown("The collection optimizer status."),
    indexed_vectors_count: s.nullable(s.nonNegativeInteger("The approximate indexed vector count.")),
    points_count: s.nullable(s.nonNegativeInteger("The approximate point count.")),
    segments_count: s.nonNegativeInteger("The number of collection segments."),
    config: s.looseObject("The collection configuration."),
    payload_schema: s.looseObject("The collection payload index schema."),
    warnings: s.array("Collection warnings.", s.looseObject("A collection warning.")),
  },
  { optional: ["indexed_vectors_count", "points_count", "warnings"] },
);

const filterInputFields = {
  filter: filterSchema,
  limit: s.integer("The maximum number of points to return.", { minimum: 1, maximum: 1000 }),
  withPayload: s.boolean("Whether to include point payloads."),
  withVector: s.boolean("Whether to include point vectors."),
};

export const qdrantActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_collections",
    description: "List the Qdrant collections visible to the authenticated API key.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing Qdrant collections."),
    outputSchema: s.actionOutput(
      {
        collections: s.array(
          "The visible Qdrant collections.",
          s.requiredObject("A Qdrant collection name.", { name: s.nonEmptyString("The collection name.") }),
        ),
      },
      "The Qdrant collection list response.",
    ),
    followUpActions: ["qdrant.get_collection", "qdrant.create_collection"],
  }),
  defineProviderAction(service, {
    name: "get_collection",
    description: "Retrieve configuration and status information for one Qdrant collection.",
    inputSchema: s.actionInput(
      { collectionName: collectionNameSchema },
      ["collectionName"],
      "Input parameters for retrieving a Qdrant collection.",
    ),
    outputSchema: s.actionOutput({ collection: collectionSchema }, "The Qdrant collection description response."),
    followUpActions: ["qdrant.query_points", "qdrant.scroll_points", "qdrant.upsert_points"],
  }),
  defineProviderAction(service, {
    name: "create_collection",
    description: "Create a Qdrant Cloud collection with one unnamed dense vector configuration.",
    inputSchema: s.actionInput(
      {
        collectionName: collectionNameSchema,
        vectorSize: s.positiveInteger("The dense vector dimension."),
        distance: s.stringEnum("The distance function used by the collection.", [
          "Cosine",
          "Euclid",
          "Dot",
          "Manhattan",
        ]),
      },
      ["collectionName", "vectorSize", "distance"],
      "Input parameters for creating a dense-vector Qdrant collection.",
    ),
    outputSchema: s.actionOutput({ created: s.boolean("Whether Qdrant created the collection.") }),
    followUpActions: ["qdrant.get_collection", "qdrant.upsert_points"],
  }),
  defineProviderAction(service, {
    name: "upsert_points",
    description: "Insert or replace dense-vector points in a Qdrant collection and wait for the write to commit.",
    inputSchema: s.actionInput(
      {
        collectionName: collectionNameSchema,
        points: s.array("The points to upsert.", pointSchema, { minItems: 1, maxItems: 1000 }),
      },
      ["collectionName", "points"],
      "Input parameters for upserting Qdrant points.",
    ),
    outputSchema: s.actionOutput(
      {
        operationId: s.nullable(
          s.nonNegativeInteger("The Qdrant operation ID when returned, within the JavaScript safe-integer range.", {
            maximum: Number.MAX_SAFE_INTEGER,
          }),
        ),
        status: s.stringEnum("The Qdrant write status.", ["acknowledged", "completed", "wait_timeout"]),
      },
      "The Qdrant upsert operation result.",
    ),
    followUpActions: ["qdrant.get_point", "qdrant.query_points", "qdrant.scroll_points"],
  }),
  defineProviderAction(service, {
    name: "get_point",
    description: "Retrieve one point by numeric ID or UUID from a Qdrant collection.",
    inputSchema: s.actionInput(
      { collectionName: collectionNameSchema, id: pointIdSchema },
      ["collectionName", "id"],
      "Input parameters for retrieving a Qdrant point.",
    ),
    outputSchema: s.actionOutput({ point: recordSchema }, "The Qdrant point record response."),
  }),
  defineProviderAction(service, {
    name: "query_points",
    description: "Search a dense-vector Qdrant collection with an optional payload filter.",
    inputSchema: s.actionInput(
      {
        collectionName: collectionNameSchema,
        vector: vectorSchema,
        ...filterInputFields,
        offset: s.nonNegativeInteger("The number of matching points to skip."),
        scoreThreshold: s.number("The minimum score a result must have."),
      },
      ["collectionName", "vector"],
      "Input parameters for querying Qdrant points.",
    ),
    outputSchema: s.actionOutput(
      { points: s.array("The scored points returned by Qdrant.", scoredPointSchema) },
      "The Qdrant query response.",
    ),
    followUpActions: ["qdrant.get_point", "qdrant.scroll_points"],
  }),
  defineProviderAction(service, {
    name: "scroll_points",
    description: "Read one page of points from a Qdrant collection with an optional payload filter.",
    inputSchema: s.actionInput(
      { collectionName: collectionNameSchema, offset: pointIdSchema, ...filterInputFields },
      ["collectionName"],
      "Input parameters for scrolling through Qdrant points.",
    ),
    outputSchema: s.actionOutput(
      {
        points: s.array("The point records returned by Qdrant.", recordSchema),
        nextOffset: s.nullable(pointIdSchema),
        complete: s.boolean("Whether there is no next page."),
      },
      "One page of Qdrant scroll results.",
    ),
    followUpActions: ["qdrant.scroll_points", "qdrant.get_point"],
  }),
];
