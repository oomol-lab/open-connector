import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pinecone";

const indexNameSchema = s.nonEmptyString("The Pinecone index name. Index names must be unique within a project.");
const indexHostSchema = s.url(
  "The full Pinecone index host URL used for data-plane operations, such as https://example.svc.us-east-1-aws.pinecone.io.",
);
const namespaceSchema = s.nonEmptyString("The Pinecone namespace to read or write.");
const metadataFilterSchema = s.looseObject("The Pinecone metadata filter expression used to select records.");
const metadataSchema = s.looseObject("The metadata object associated with a Pinecone record.");
const jsonObjectSchema = s.looseObject("A JSON object accepted or returned by Pinecone.");
const usageSchema = s.looseObject("The Pinecone usage object returned by the operation.");
const sparseValuesSchema = s.object("The sparse vector values and indices.", {
  indices: s.array("The sparse vector indices.", s.integer("One sparse vector index."), {
    minItems: 1,
    maxItems: 2048,
  }),
  values: s.array("The sparse vector values matching the indices array.", s.number("One value."), {
    minItems: 1,
    maxItems: 2048,
  }),
});
const vectorValuesSchema = s.array("The dense vector values.", s.number("One dense vector value."), {
  minItems: 1,
  maxItems: 20000,
});
const vectorSchema = s.object(
  "One vector record to upsert into Pinecone.",
  {
    id: s.nonEmptyString("The vector identifier."),
    values: vectorValuesSchema,
    sparseValues: sparseValuesSchema,
    metadata: metadataSchema,
  },
  { optional: ["values", "sparseValues", "metadata"] },
);
const indexSchema = s.looseRequiredObject(
  "A Pinecone index description.",
  {
    name: s.string("The index name."),
    host: s.string("The index host for data-plane operations."),
    dimension: s.nullable(s.integer("The vector dimension when present.")),
    metric: s.string("The similarity metric used by the index."),
    vector_type: s.string("The vector type stored by the index."),
    deletion_protection: s.string("Whether deletion protection is enabled for the index."),
    spec: jsonObjectSchema,
    status: jsonObjectSchema,
    tags: jsonObjectSchema,
  },
  { optional: ["host", "dimension", "metric", "vector_type", "deletion_protection", "spec", "status", "tags"] },
);
const fetchedVectorSchema = s.looseRequiredObject(
  "A vector record returned by Pinecone.",
  {
    id: s.string("The vector identifier."),
    values: vectorValuesSchema,
    sparseValues: sparseValuesSchema,
    metadata: metadataSchema,
  },
  { optional: ["values", "sparseValues", "metadata"] },
);
const dataPlaneTargetSchema = {
  indexHost: indexHostSchema,
};

export const pineconeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_indexes",
    operationType: "read",
    description: "List Pinecone indexes in the authenticated project.",
    requiredScopes: [],
    inputSchema: s.object("The input for listing Pinecone indexes.", {}),
    outputSchema: s.object("The Pinecone indexes response.", {
      indexes: s.array("The indexes returned by Pinecone.", indexSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "describe_index",
    operationType: "read",
    description: "Describe one Pinecone index by name.",
    requiredScopes: [],
    inputSchema: s.object("The input for describing one Pinecone index.", { name: indexNameSchema }),
    outputSchema: s.object("The Pinecone index description response.", { index: indexSchema }),
  }),
  defineProviderAction(service, {
    name: "create_index",
    operationType: "write",
    description: "Create a Pinecone serverless index.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for creating a Pinecone serverless index.",
      {
        name: indexNameSchema,
        dimension: s.integer("The vector dimension for dense indexes.", { minimum: 1, maximum: 20000 }),
        metric: s.stringEnum("The similarity metric for the index.", ["cosine", "euclidean", "dotproduct"]),
        cloud: s.stringEnum("The public cloud for a serverless index.", ["aws", "gcp", "azure"]),
        region: s.nonEmptyString("The cloud region where the serverless index is created."),
        vectorType: s.stringEnum("The index vector type.", ["dense", "sparse"]),
        deletionProtection: s.stringEnum("Whether deletion protection is enabled.", ["enabled", "disabled"]),
        tags: s.record("The tags to attach to the index.", s.string("One tag value.")),
      },
      { optional: ["dimension", "metric", "vectorType", "deletionProtection", "tags"] },
    ),
    outputSchema: s.object("The Pinecone create index response.", { index: indexSchema }),
  }),
  defineProviderAction(service, {
    name: "configure_index",
    operationType: "write",
    description: "Configure an existing Pinecone index.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for configuring an existing Pinecone index.",
      {
        name: indexNameSchema,
        deletionProtection: s.stringEnum("Whether deletion protection is enabled.", ["enabled", "disabled"]),
        tags: s.record("The replacement tags to set on the index.", s.string("One tag value.")),
        readCapacity: jsonObjectSchema,
      },
      { optional: ["deletionProtection", "tags", "readCapacity"] },
    ),
    outputSchema: s.object("The Pinecone configure index response.", { index: indexSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_index",
    operationType: "destructive",
    description: "Delete one Pinecone index by name.",
    requiredScopes: [],
    inputSchema: s.object("The input for deleting one Pinecone index.", { name: indexNameSchema }),
    outputSchema: s.object("The Pinecone delete index response.", {
      accepted: s.boolean("Whether Pinecone accepted the delete request."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_index_stats",
    operationType: "read",
    description: "Get statistics for a Pinecone index.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving Pinecone index statistics.",
      { ...dataPlaneTargetSchema, filter: metadataFilterSchema },
      { optional: ["filter"] },
    ),
    outputSchema: s.object("The Pinecone index statistics response.", { stats: jsonObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "upsert_vectors",
    operationType: "write",
    description: "Upsert dense or sparse vectors into a Pinecone index namespace.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for upserting vectors into Pinecone.",
      {
        ...dataPlaneTargetSchema,
        vectors: s.array("The vectors to upsert.", vectorSchema, { minItems: 1, maxItems: 1000 }),
        namespace: namespaceSchema,
      },
      { optional: ["namespace"] },
    ),
    outputSchema: s.object("The Pinecone upsert response.", {
      upsertedCount: s.nonNegativeInteger("The number of vectors upserted."),
      raw: jsonObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "query_vectors",
    operationType: "read",
    description: "Search a Pinecone index namespace with a query vector.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for querying Pinecone vectors.",
      {
        ...dataPlaneTargetSchema,
        values: vectorValuesSchema,
        sparseValues: sparseValuesSchema,
        id: s.nonEmptyString("The vector ID to use as the query vector."),
        topK: s.integer("The number of similar vectors to return.", { minimum: 1, maximum: 10000 }),
        namespace: namespaceSchema,
        filter: metadataFilterSchema,
        includeValues: s.boolean("Whether to include vector values in the response."),
        includeMetadata: s.boolean("Whether to include vector metadata in the response."),
      },
      { optional: ["values", "sparseValues", "id", "namespace", "filter", "includeValues", "includeMetadata"] },
    ),
    outputSchema: s.object("The Pinecone query response.", {
      matches: s.array("The vector matches returned by Pinecone.", s.looseObject("One match.")),
      namespace: s.nullable(s.string("The namespace returned by Pinecone.")),
      usage: s.nullable(usageSchema),
      raw: jsonObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "fetch_vectors",
    operationType: "read",
    description: "Fetch Pinecone vectors by ID from one namespace.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for fetching Pinecone vectors.",
      {
        ...dataPlaneTargetSchema,
        ids: s.array("The vector IDs to fetch.", s.nonEmptyString("One vector ID."), {
          minItems: 1,
          maxItems: 1000,
        }),
        namespace: namespaceSchema,
      },
      { optional: ["namespace"] },
    ),
    outputSchema: s.object("The Pinecone fetch vectors response.", {
      vectors: s.record("The vectors keyed by ID.", fetchedVectorSchema),
      namespace: s.nullable(s.string("The namespace returned by Pinecone.")),
      usage: s.nullable(usageSchema),
      raw: jsonObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_vector_ids",
    operationType: "read",
    description: "List vector IDs in a Pinecone serverless index namespace.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing Pinecone vector IDs.",
      {
        ...dataPlaneTargetSchema,
        namespace: namespaceSchema,
        prefix: s.nonEmptyString("The ID prefix used to filter vector IDs."),
        limit: s.integer("The maximum number of IDs to return.", { minimum: 1, maximum: 1000 }),
        paginationToken: s.nonEmptyString("The pagination token returned by a previous Pinecone response."),
      },
      { optional: ["namespace", "prefix", "limit", "paginationToken"] },
    ),
    outputSchema: s.object("The Pinecone list vector IDs response.", {
      vectors: s.array("The vector ID objects returned by Pinecone.", s.looseObject("One vector ID object.")),
      pagination: s.nullable(jsonObjectSchema),
      raw: jsonObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_vectors",
    operationType: "destructive",
    description: "Delete vectors from a Pinecone index namespace by IDs, filter, or deleteAll.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for deleting Pinecone vectors.",
      {
        ...dataPlaneTargetSchema,
        ids: s.array("The vector IDs to delete.", s.nonEmptyString("One vector ID."), {
          minItems: 1,
          maxItems: 1000,
        }),
        namespace: namespaceSchema,
        filter: metadataFilterSchema,
        deleteAll: s.boolean("Whether to delete all records in the namespace."),
      },
      { optional: ["ids", "namespace", "filter", "deleteAll"] },
    ),
    outputSchema: s.object("The Pinecone delete vectors response.", { raw: jsonObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "update_vector",
    operationType: "write",
    description: "Update one Pinecone vector or metadata-matched records in a namespace.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for updating Pinecone vectors.",
      {
        ...dataPlaneTargetSchema,
        id: s.nonEmptyString("The vector ID to update."),
        values: vectorValuesSchema,
        sparseValues: sparseValuesSchema,
        setMetadata: metadataSchema,
        namespace: namespaceSchema,
        filter: metadataFilterSchema,
        dryRun: s.boolean("Whether to count matching records without applying the update."),
      },
      { optional: ["id", "values", "sparseValues", "setMetadata", "namespace", "filter", "dryRun"] },
    ),
    outputSchema: s.object("The Pinecone update vector response.", {
      matchedRecords: s.nullable(s.nonNegativeInteger("The number of records matched when Pinecone returns a count.")),
      raw: jsonObjectSchema,
    }),
  }),
];
