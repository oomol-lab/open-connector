import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ragie";

const metadataValueSchema = s.union(
  [
    s.string("A string metadata value."),
    s.number("A numeric metadata value."),
    s.boolean("A boolean metadata value."),
    { type: "null" },
    s.array(s.union([s.string(), s.number(), s.boolean(), { type: "null" }]), {
      description: "An array metadata value.",
    }),
  ],
  { description: "A Ragie metadata value." },
);

const metadataSchema = s.record("A metadata object containing Ragie-compatible primitive values.", metadataValueSchema);
const looseObjectSchema = s.unknownObject("A loose JSON object accepted by Ragie.");

const paginationSchema = s.object("Pagination information returned by Ragie.", {
  nextCursor: s.nullable(s.string("The cursor for the next page of results.")),
  totalCount: s.integer("The total number of records in the result set."),
});

const documentSchema = s.looseObject("A Ragie document.", {
  id: s.string("The unique identifier of the document."),
  name: s.string("The document name."),
  status: s.string("The current processing status of the document."),
  metadata: metadataSchema,
  partition: s.string("The partition that scopes the document."),
  createdAt: s.dateTime("The ISO 8601 timestamp when the document was created."),
  updatedAt: s.dateTime("The ISO 8601 timestamp when the document was last updated."),
  pageCount: s.number("The number of pages in the document."),
  chunkCount: s.integer("The number of generated chunks."),
  externalId: s.string("The external identifier of the document."),
});

const detailedDocumentSchema = s.looseObject("A detailed Ragie document.", {
  ...(documentSchema.properties as Record<string, JsonSchema>),
  errors: s.stringArray("The list of processing errors."),
});

const documentContentSchema = s.looseObject("A Ragie document including content.", {
  ...(documentSchema.properties as Record<string, JsonSchema>),
  content: s.string("The document content in the requested media type."),
});

const documentChunkSchema = s.looseObject("A Ragie document chunk.", {
  id: s.string("The unique identifier of the chunk."),
  text: s.string("The chunk text content."),
  index: s.integer("The zero-based chunk index."),
  links: looseObjectSchema,
  metadata: looseObjectSchema,
});

const scoredChunkSchema = s.looseObject("A scored retrieval chunk returned by Ragie.", {
  ...(documentChunkSchema.properties as Record<string, JsonSchema>),
  score: s.number("The retrieval relevance score."),
  documentId: s.string("The identifier of the source document."),
  documentName: s.string("The name of the source document."),
  documentMetadata: metadataSchema,
});

const partitionLimitsSchema = s.looseObject("A Ragie partition limits object.", {
  mediaHostedLimitMax: s.integer("The maximum hosted media limit in megabytes."),
  pagesHostedLimitMax: s.integer("The maximum hosted pages limit."),
  mediaStreamedLimitMax: s.integer("The maximum streamed media limit in megabytes."),
  audioProcessedLimitMax: s.integer("The maximum audio processing limit in minutes."),
  pagesProcessedLimitMax: s.integer("The maximum processed pages limit."),
  videoProcessedLimitMax: s.integer("The maximum video processing limit in minutes."),
  mediaHostedLimitMonthly: s.integer("The monthly hosted media limit in megabytes."),
  pagesHostedLimitMonthly: s.integer("The monthly hosted pages limit."),
  mediaStreamedLimitMonthly: s.integer("The monthly streamed media limit in megabytes."),
  audioProcessedLimitMonthly: s.integer("The monthly audio processing limit in minutes."),
  pagesProcessedLimitMonthly: s.integer("The monthly processed pages limit."),
  videoProcessedLimitMonthly: s.integer("The monthly video processing limit in minutes."),
});

const partitionStatsSchema = s.looseObject("A Ragie partition stats object.", {
  documentCount: s.integer("The total number of documents in the partition."),
  documentsCount: s.integer("The total number of documents in the partition."),
  pagesHostedCount: s.integer("The hosted pages count."),
  pagesProcessedCount: s.integer("The processed pages count."),
  mediaHostedMegabytes: s.number("The hosted media usage in megabytes."),
  mediaStreamedMegabytes: s.number("The streamed media usage in megabytes."),
  audioProcessedMinutes: s.number("The processed audio usage in minutes."),
  videoProcessedMinutes: s.number("The processed video usage in minutes."),
  mediaHostedTotal: s.number("The total hosted media usage in megabytes."),
  pagesHostedTotal: s.number("The total hosted pages usage."),
  mediaHostedMonthly: s.number("The current month's hosted media usage in megabytes."),
  mediaStreamedTotal: s.number("The total streamed media usage in megabytes."),
  pagesHostedMonthly: s.number("The current month's hosted pages usage."),
  audioProcessedTotal: s.number("The total processed audio usage."),
  pagesProcessedTotal: s.number("The total processed pages usage."),
  videoProcessedTotal: s.number("The total processed video usage."),
  mediaStreamedMonthly: s.number("The current month's streamed media usage."),
  audioProcessedMonthly: s.number("The current month's processed audio usage."),
  pagesProcessedMonthly: s.number("The current month's processed pages usage."),
  videoProcessedMonthly: s.number("The current month's processed video usage."),
});

const partitionSchema = s.looseObject("A Ragie partition.", {
  name: s.string("The partition identifier."),
  isDefault: s.boolean("Whether the partition is the default partition."),
  description: s.string("The partition description."),
  contextAware: s.boolean("Whether the partition is context-aware."),
  metadataSchema: looseObjectSchema,
  limits: partitionLimitsSchema,
  stats: partitionStatsSchema,
  limitExceededAt: s.dateTime("The timestamp when the partition exceeded its limits."),
});

const connectorSourceTypeSchema = s.looseObject("A Ragie connector source type.", {
  sourceType: s.string("The connector source type identifier."),
  displayName: s.string("The connector display name."),
  iconUrl: s.url("The connector icon URL."),
  docsUrl: s.url("The documentation URL for the connector."),
});

const connectionSchema = s.looseObject("A Ragie connection.", {
  id: s.string("The unique connection identifier."),
  name: s.string("The connection display name."),
  type: s.string("The connection source type."),
  source: looseObjectSchema,
  enabled: s.boolean("Whether the connection is enabled."),
  metadata: looseObjectSchema,
  createdAt: s.dateTime("The ISO 8601 timestamp when the connection was created."),
  updatedAt: s.dateTime("The ISO 8601 timestamp when the connection was last updated."),
  pageLimit: s.integer("The maximum page limit configured on the connection."),
  disabledBySystem: s.boolean("Whether the connection was disabled by the system."),
  disabledBySystemReason: s.nullable(s.string("The reason why the system disabled the connection.")),
});

const processingModeSchema = s.union([s.string("The Ragie processing mode string."), looseObjectSchema], {
  description: "The optional processing mode for ingestion.",
});

const partitionLimitFields: Record<string, JsonSchema> = {
  mediaHostedLimitMax: s.integer("The maximum hosted media limit in megabytes."),
  pagesHostedLimitMax: s.integer("The maximum hosted pages limit."),
  mediaStreamedLimitMax: s.integer("The maximum streamed media limit in megabytes."),
  audioProcessedLimitMax: s.integer("The maximum audio processing limit in minutes."),
  pagesProcessedLimitMax: s.integer("The maximum processed pages limit."),
  videoProcessedLimitMax: s.integer("The maximum video processing limit in minutes."),
  mediaHostedLimitMonthly: s.integer("The monthly hosted media limit in megabytes."),
  pagesHostedLimitMonthly: s.integer("The monthly hosted pages limit."),
  mediaStreamedLimitMonthly: s.integer("The monthly streamed media limit in megabytes."),
  audioProcessedLimitMonthly: s.integer("The monthly audio processing limit in minutes."),
  pagesProcessedLimitMonthly: s.integer("The monthly processed pages limit."),
  videoProcessedLimitMonthly: s.integer("The monthly video processing limit in minutes."),
};

function defineRagieAction(input: {
  name: RagieActionName;
  operationType: ProviderActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ProviderActionDefinition {
  return defineProviderAction(service, input);
}

export const ragieActions: ProviderActionDefinition[] = [
  defineRagieAction({
    name: "retrieve",
    operationType: "read",
    description:
      "Retrieve the most relevant Ragie document chunks for a query, with optional metadata filters, reranking, and partition scoping.",
    inputSchema: s.actionInput(
      {
        query: s.string("The search query used for retrieval."),
        topK: s.positiveInteger("The maximum number of chunks to return."),
        filter: looseObjectSchema,
        rerank: s.boolean("Whether Ragie should rerank chunks for semantic relevance."),
        partition: s.string("The partition to scope retrieval to."),
        recencyBias: s.boolean("Whether to favor newer documents during retrieval."),
        maxChunksPerDocument: s.positiveInteger("The maximum number of chunks to return per document."),
      },
      ["query"],
    ),
    outputSchema: s.actionOutput({
      scoredChunks: s.array(scoredChunkSchema, { description: "The retrieved document chunks." }),
    }),
  }),
  defineRagieAction({
    name: "list_documents",
    operationType: "read",
    description:
      "List Ragie documents with filter, cursor pagination, and optional partition scoping to inspect ingestion progress.",
    inputSchema: s.actionInput({
      cursor: s.string("The pagination cursor returned by a previous list call."),
      filter: s.string("The filter expression used to narrow returned documents."),
      pageSize: s.integer("The number of documents to return per page.", { minimum: 1, maximum: 100 }),
      partition: s.string("The partition to scope the request to."),
    }),
    outputSchema: s.actionOutput({
      documents: s.array(documentSchema, { description: "The returned documents." }),
      pagination: paginationSchema,
    }),
  }),
  defineRagieAction({
    name: "get_document",
    operationType: "read",
    description: "Get a single Ragie document by ID to inspect status, metadata, errors, and counts.",
    inputSchema: s.actionInput(
      {
        documentId: s.string("The document identifier."),
        partition: s.string("The partition to scope the request to."),
      },
      ["documentId"],
    ),
    outputSchema: detailedDocumentSchema,
  }),
  defineRagieAction({
    name: "create_document_raw",
    operationType: "write",
    description:
      "Create a Ragie document from raw text or JSON data when the content already exists in memory and does not need file upload.",
    inputSchema: s.actionInput(
      {
        data: s.union([s.string("The raw text content to ingest."), looseObjectSchema], {
          description: "The raw data to ingest into Ragie.",
        }),
        name: s.string("The user-facing document name."),
        metadata: metadataSchema,
        partition: s.string("The partition to place the document in."),
        externalId: s.string("The external identifier of the document."),
      },
      ["data"],
    ),
    outputSchema: documentSchema,
  }),
  defineRagieAction({
    name: "create_document_from_url",
    operationType: "write",
    description: "Create a Ragie document from a public URL when the source file is already hosted externally.",
    inputSchema: s.actionInput(
      {
        url: s.url("The public URL of the source document."),
        mode: processingModeSchema,
        name: s.string("The user-facing document name."),
        metadata: metadataSchema,
        partition: s.string("The partition to place the document in."),
        externalId: s.string("The external identifier of the document."),
      },
      ["url"],
    ),
    outputSchema: documentSchema,
  }),
  defineRagieAction({
    name: "patch_document_metadata",
    operationType: "write",
    description: "Patch Ragie document metadata in place without replacing the entire metadata object.",
    inputSchema: s.actionInput(
      {
        documentId: s.string("The document identifier."),
        metadata: s.record("The metadata fields to upsert or remove with null values.", metadataValueSchema),
        partition: s.string("The partition to scope the request to."),
        async: s.boolean("Whether Ragie should run the metadata patch asynchronously."),
      },
      ["documentId", "metadata"],
    ),
    outputSchema: s.actionOutput(
      {
        status: s.string("The accepted status when Ragie runs the patch asynchronously."),
        metadata: metadataSchema,
      },
      "The output payload for this action.",
      [],
    ),
  }),
  defineRagieAction({
    name: "get_document_content",
    operationType: "read",
    description:
      "Get Ragie document content in the requested media type, with optional byte range and download behavior.",
    inputSchema: s.actionInput(
      {
        documentId: s.string("The document identifier."),
        range: s.string("The HTTP byte range to request from Ragie."),
        download: s.boolean("Whether Ragie should return content as a download."),
        partition: s.string("The partition to scope the request to."),
        mediaType: s.string("The media type to request from Ragie."),
      },
      ["documentId"],
    ),
    outputSchema: documentContentSchema,
  }),
  defineRagieAction({
    name: "get_document_summary",
    operationType: "read",
    description: "Get the Ragie-generated summary for a specific document.",
    inputSchema: s.actionInput(
      {
        documentId: s.string("The document identifier."),
        partition: s.string("The partition to scope the request to."),
      },
      ["documentId"],
    ),
    outputSchema: s.actionOutput({
      documentId: s.string("The document identifier."),
      summary: s.string("The summary generated by Ragie."),
    }),
  }),
  defineRagieAction({
    name: "get_document_chunks",
    operationType: "read",
    description: "List the chunks of a Ragie document with cursor pagination and optional start/end index filtering.",
    inputSchema: s.actionInput(
      {
        documentId: s.string("The document identifier."),
        cursor: s.string("The pagination cursor returned by a previous chunk list call."),
        pageSize: s.integer("The number of chunks to return per page.", { minimum: 1, maximum: 100 }),
        partition: s.string("The partition to scope the request to."),
        startIndex: s.integer("The inclusive starting chunk index."),
        endIndex: s.integer("The inclusive ending chunk index."),
      },
      ["documentId"],
    ),
    outputSchema: s.actionOutput({
      chunks: s.array(documentChunkSchema, { description: "The returned chunks." }),
      pagination: paginationSchema,
    }),
  }),
  defineRagieAction({
    name: "delete_document",
    operationType: "destructive",
    description: "Delete a Ragie document, optionally in asynchronous mode.",
    inputSchema: s.actionInput(
      {
        documentId: s.string("The document identifier."),
        async: s.boolean("Whether Ragie should delete the document asynchronously."),
        partition: s.string("The partition to scope the request to."),
      },
      ["documentId"],
    ),
    outputSchema: s.actionOutput({
      status: s.string("The deletion status returned by Ragie."),
    }),
  }),
  defineRagieAction({
    name: "list_partitions",
    operationType: "read",
    description: "List available Ragie partitions and their current limits with cursor pagination.",
    inputSchema: s.actionInput({
      cursor: s.string("The pagination cursor returned by a previous list call."),
      pageSize: s.integer("The number of partitions to return per page.", { minimum: 1, maximum: 100 }),
    }),
    outputSchema: s.actionOutput({
      partitions: s.array(partitionSchema, { description: "The returned partitions." }),
      pagination: paginationSchema,
    }),
  }),
  defineRagieAction({
    name: "get_partition",
    operationType: "read",
    description: "Get a specific Ragie partition together with its limits and usage stats.",
    inputSchema: s.actionInput({ partitionId: s.string("The partition identifier.") }, ["partitionId"]),
    outputSchema: partitionSchema,
  }),
  defineRagieAction({
    name: "create_partition",
    operationType: "write",
    description:
      "Create a Ragie partition to isolate documents, metadata schemas, and resource limits by workspace or tenant.",
    inputSchema: s.actionInput(
      {
        name: s.string("The partition identifier to create."),
        description: s.string("The partition description."),
        contextAware: s.boolean("Whether the partition should generate context-aware descriptions."),
        metadataSchema: looseObjectSchema,
        ...partitionLimitFields,
      },
      ["name"],
    ),
    outputSchema: partitionSchema,
  }),
  defineRagieAction({
    name: "update_partition",
    operationType: "write",
    description:
      "Update a Ragie partition's description, metadata schema, and context-aware setting without recreating it.",
    inputSchema: s.actionInput(
      {
        partitionId: s.string("The partition identifier."),
        description: s.string("The updated partition description."),
        contextAware: s.boolean("Whether the partition should be context-aware after the update."),
        metadataSchema: looseObjectSchema,
      },
      ["partitionId"],
    ),
    outputSchema: partitionSchema,
  }),
  defineRagieAction({
    name: "set_partition_limits",
    operationType: "write",
    description: "Update the page, media, audio, and video limits on an existing Ragie partition.",
    inputSchema: s.actionInput(
      {
        partitionId: s.string("The partition identifier."),
        ...partitionLimitFields,
      },
      ["partitionId"],
    ),
    outputSchema: partitionSchema,
  }),
  defineRagieAction({
    name: "delete_partition",
    operationType: "destructive",
    description: "Delete a Ragie partition, optionally in asynchronous mode.",
    inputSchema: s.actionInput(
      {
        partitionId: s.string("The partition identifier."),
        asyncDeletion: s.boolean("Whether Ragie should delete the partition asynchronously."),
      },
      ["partitionId"],
    ),
    outputSchema: s.actionOutput({
      message: s.string("The deletion result message returned by Ragie."),
    }),
  }),
  defineRagieAction({
    name: "list_connection_source_types",
    operationType: "read",
    description:
      "List the embedded connector source types that Ragie can authorize and sync through its connections API.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      connectors: s.array(connectorSourceTypeSchema, { description: "The available connector source types." }),
    }),
  }),
  defineRagieAction({
    name: "list_connections",
    operationType: "read",
    description: "List Ragie connections with metadata filtering, pagination, and optional partition scoping.",
    inputSchema: s.actionInput({
      cursor: s.string("The pagination cursor returned by a previous list call."),
      filter: s.string("The filter expression used to narrow returned connections."),
      pageSize: s.integer("The number of connections to return per page.", { minimum: 1, maximum: 100 }),
      partition: s.string("The partition to scope the request to."),
    }),
    outputSchema: s.actionOutput({
      connections: s.array(connectionSchema, { description: "The returned connections." }),
      pagination: paginationSchema,
    }),
  }),
  defineRagieAction({
    name: "create_oauth_redirect_url",
    operationType: "write",
    description:
      "Create the Ragie embedded OAuth redirect URL for a connection source type such as Google Drive or Notion.",
    inputSchema: s.actionInput(
      {
        redirectUri: s.url("The redirect URI that Ragie should return the user to."),
        sourceType: s.string("The Ragie connection source type to authorize."),
        theme: s.stringEnum("The theme for Ragie's OAuth UI.", ["light", "dark", "system"]),
        config: looseObjectSchema,
        metadata: metadataSchema,
        partition: s.string("The partition to scope the connection to."),
        pageLimit: s.positiveInteger("The maximum number of pages Ragie may sync."),
        mode: processingModeSchema,
        authenticatorId: s.string("The white-label authenticator identifier to use."),
      },
      ["redirectUri"],
    ),
    outputSchema: s.actionOutput({
      url: s.url("The OAuth redirect URL returned by Ragie."),
    }),
  }),
];

export type RagieActionName =
  | "retrieve"
  | "list_documents"
  | "get_document"
  | "create_document_raw"
  | "create_document_from_url"
  | "patch_document_metadata"
  | "get_document_content"
  | "get_document_summary"
  | "get_document_chunks"
  | "delete_document"
  | "list_partitions"
  | "get_partition"
  | "create_partition"
  | "update_partition"
  | "set_partition_limits"
  | "delete_partition"
  | "list_connection_source_types"
  | "list_connections"
  | "create_oauth_redirect_url";
