import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "moorcheh";

const namespaceNameSchema = s.stringPattern("^[A-Za-z0-9_-]+$", {
  description: "The Moorcheh namespace name containing only letters, numbers, hyphens, or underscores.",
});
const documentIdSchema = s.nonEmptyString("A Moorcheh document identifier.");
const metadataSchema = s.looseObject("Arbitrary metadata associated with a Moorcheh document.");

const statusMessageSchema: Record<string, JsonSchema> = {
  status: s.string("The operation status returned by Moorcheh."),
  message: s.string("The human-readable operation message returned by Moorcheh."),
};

const documentSchema = s.looseRequiredObject("A text document uploaded to Moorcheh.", {
  id: documentIdSchema,
  text: s.nonEmptyString("The text content indexed by Moorcheh."),
});

const storedDocumentSchema = s.looseRequiredObject("A text document returned by Moorcheh.", {
  id: s.string("The document or chunk identifier returned by Moorcheh."),
  text: s.string("The stored text returned by Moorcheh."),
  metadata: metadataSchema,
});

const createNamespaceOutputSchema = s.looseRequiredObject("The text namespace creation result returned by Moorcheh.", {
  ...statusMessageSchema,
  namespace_name: s.string("The created namespace name."),
});

const namespaceSchema = s.looseRequiredObject("One Moorcheh namespace.", {
  namespace_name: s.string("The namespace name."),
  type: s.stringEnum("The namespace storage type.", ["text", "vector"]),
  vector_dimension: s.nullableInteger("The vector dimension, or null for text namespaces."),
  item_count: s.integer("The number of items in the namespace."),
  created_at: s.string("The namespace creation timestamp."),
});

const documentIdsSchema = s.array("Document identifiers to process.", documentIdSchema, {
  minItems: 1,
  maxItems: 100,
});

const uploadOutputSchema = s.looseRequiredObject(
  "The text document upload result returned by Moorcheh.",
  {
    ...statusMessageSchema,
    upload_id: s.string("The upload batch identifier."),
    namespace_name: s.string("The target namespace name."),
    documents_processed: s.integer("The number of documents accepted for processing."),
    processing_status: s.string("The current upload processing status."),
    uploaded_documents: s.array(
      "The accepted document statuses.",
      s.looseRequiredObject("One accepted document status.", {
        id: s.string("The accepted document identifier."),
        status: s.string("The document processing status."),
        character_count: s.integer("The number of characters in the accepted document."),
      }),
    ),
  },
  {
    optional: ["upload_id", "namespace_name", "documents_processed", "processing_status", "uploaded_documents"],
  },
);

const batchDocumentsOutputSchema = s.looseRequiredObject("The batch document retrieval result returned by Moorcheh.", {
  ...statusMessageSchema,
  requested_ids: s.integer("The number of requested document identifiers."),
  found_items: s.integer("The number of documents found."),
  items: s.array("The documents found in the namespace.", storedDocumentSchema),
});

const fetchTextOutputSchema = s.looseRequiredObject("One cursor-paginated page of text data returned by Moorcheh.", {
  ...statusMessageSchema,
  namespace: s.string("The requested namespace name."),
  statistics: s.looseObject("Statistics for the returned page."),
  items: s.array(
    "The text and summary chunks in this page.",
    s.looseRequiredObject("One stored text or summary chunk.", {
      id: s.string("The chunk identifier."),
      text: s.string("The chunk text."),
      metadata: metadataSchema,
      created_at: s.nullableString("The normalized chunk creation timestamp."),
      is_summary: s.boolean("Whether the item is a generated summary chunk."),
    }),
  ),
  pagination: s.looseRequiredObject("Cursor pagination metadata for this page.", {
    limit: s.integer("The page size used by Moorcheh."),
    has_more: s.boolean("Whether another page is available."),
    next_token: s.nullableString("The opaque cursor for the next page."),
  }),
  execution_time: s.number("The request processing time in seconds."),
});

const deleteOutputSchema = s.looseRequiredObject("The batch document deletion result returned by Moorcheh.", {
  ...statusMessageSchema,
  requested_deletions: s.integer("The number of requested document deletions."),
  actual_deletions: s.integer("The number of documents actually deleted."),
  remaining_items: s.integer("The number of items remaining in the namespace."),
});

const searchOutputSchema = s.looseRequiredObject("The semantic search result from Moorcheh.", {
  results: s.array(
    "Search results ordered by relevance.",
    s.looseRequiredObject("One Moorcheh semantic search result.", {
      id: s.string("The matching document identifier."),
      score: s.number("The Information Theoretic Similarity score."),
      label: s.string("The human-readable relevance label."),
      text: s.string("The matching text content."),
      metadata: metadataSchema,
    }),
  ),
  execution_time: s.number("The total search processing time in seconds."),
});

export const moorchehActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_text_namespace",
    operationType: "write",
    description: "Create a text namespace in Moorcheh for storing searchable documents.",
    inputSchema: s.actionInput(
      {
        namespace_name: namespaceNameSchema,
      },
      ["namespace_name"],
      "Input for creating a Moorcheh text namespace.",
    ),
    outputSchema: createNamespaceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_namespaces",
    operationType: "read",
    description: "List Moorcheh namespaces with their types, sizes, and creation times.",
    inputSchema: s.actionInput({}, [], "Input for listing Moorcheh namespaces."),
    outputSchema: s.actionOutput(
      {
        namespaces: s.array("Namespaces owned by the authenticated account.", namespaceSchema),
      },
      "The Moorcheh namespace list.",
    ),
  }),
  defineProviderAction(service, {
    name: "upload_text_documents",
    operationType: "write",
    description: "Upload text documents and flat metadata to a Moorcheh text namespace.",
    inputSchema: s.actionInput(
      {
        namespace_name: namespaceNameSchema,
        documents: s.array("Text documents to upload.", documentSchema, { minItems: 1 }),
      },
      ["namespace_name", "documents"],
      "Input for uploading text documents to Moorcheh.",
    ),
    outputSchema: uploadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_documents",
    operationType: "read",
    description: "Retrieve up to 100 Moorcheh text documents by identifier.",
    inputSchema: s.actionInput(
      {
        namespace_name: namespaceNameSchema,
        ids: documentIdsSchema,
      },
      ["namespace_name", "ids"],
      "Input for retrieving Moorcheh documents by identifier.",
    ),
    outputSchema: batchDocumentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_text_data",
    operationType: "read",
    description: "Fetch one cursor-paginated page of text chunks from a Moorcheh namespace.",
    inputSchema: s.actionInput(
      {
        namespace_name: namespaceNameSchema,
        limit: s.integer("The maximum number of items to return, up to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        next_token: s.nonEmptyString("The opaque cursor returned by the previous page."),
      },
      ["namespace_name"],
      "Input for fetching a page of Moorcheh text data.",
    ),
    outputSchema: fetchTextOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_documents",
    operationType: "destructive",
    description: "Permanently delete up to 1,000 documents from a Moorcheh text namespace.",
    inputSchema: s.actionInput(
      {
        namespace_name: namespaceNameSchema,
        ids: s.array("Document identifiers to delete.", documentIdSchema, {
          minItems: 1,
          maxItems: 1000,
        }),
      },
      ["namespace_name", "ids"],
      "Input for deleting Moorcheh text documents.",
    ),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_text",
    operationType: "read",
    description: "Search one or more Moorcheh text namespaces with a semantic text query.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString("The semantic text query, optionally ending with Moorcheh filters."),
        namespaces: s.array("Text namespace names to search.", namespaceNameSchema, {
          minItems: 1,
        }),
        top_k: s.integer("The maximum number of relevant chunks to return.", { minimum: 1 }),
        kiosk_mode: s.boolean("Whether to filter results below a relevance threshold."),
        threshold: s.number("The minimum relevance score when kiosk_mode is enabled.", {
          minimum: 0,
          maximum: 1,
        }),
      },
      ["query", "namespaces"],
      "Input for semantic text search in Moorcheh.",
    ),
    outputSchema: searchOutputSchema,
  }),
];
