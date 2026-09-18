import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "supermemory" as const;

const containerTagSchema = s.nonEmptyString("The user, project, or tenant container tag that scopes this operation.", {
  maxLength: 100,
});
const metadataValueSchema = s.anyOf("A supported metadata value.", [
  s.string("A string metadata value."),
  s.number("A numeric metadata value."),
  s.boolean("A boolean metadata value."),
  s.stringArray("A list of string metadata values."),
]);
const metadataSchema = s.record("Flat metadata used to organize and filter Supermemory content.", metadataValueSchema);
const looseObjectSchema = s.looseObject("An arbitrary JSON object returned by Supermemory.");
const nullableLooseObjectSchema = s.nullable(looseObjectSchema);
const nullableStringSchema = s.nullable(s.string("A nullable string value."));
const temporalContextSchema = s.object("Dates that help Supermemory interpret when this memory is relevant.", {
  documentDate: s.optional(s.nullable(s.dateTime("The date when the source document was authored."))),
  eventDate: s.optional(
    s.nullable(
      s.stringArray("Dates of events referenced by this memory.", {
        itemDescription: "An event date.",
      }),
    ),
  ),
});
const memoryInputSchema = s.requiredObject("One exact fact to store directly as a searchable memory.", {
  content: s.nonEmptyString("The entity-centric memory text to store.", {
    maxLength: 10_000,
  }),
  isStatic: s.optional(s.boolean("Whether this is a permanent trait such as a name, profession, or hometown.")),
  metadata: s.optional(metadataSchema),
  forgetAfter: s.optional(s.nullable(s.dateTime("When Supermemory should automatically forget this memory."))),
  forgetReason: s.optional(s.nullable(s.string("Why this memory is scheduled to be forgotten."))),
  temporalContext: s.optional(temporalContextSchema),
});
const memorySchema = s.looseRequiredObject("A memory returned by Supermemory.", {
  id: s.string("The memory identifier."),
  memory: s.string("The stored memory text."),
  isStatic: s.boolean("Whether the memory represents a permanent trait."),
  createdAt: s.string("When the memory was created."),
  forgetAfter: s.describe(nullableStringSchema, "When the memory will be forgotten, if set."),
  forgetReason: s.describe(nullableStringSchema, "Why the memory will be forgotten, if set."),
  metadata: s.describe(nullableLooseObjectSchema, "Metadata attached to the memory."),
});
const searchResultSchema = s.looseRequiredObject(
  "A memory or document chunk returned by Supermemory search.",
  {
    id: s.string("The memory entry or chunk identifier."),
    memory: s.optional(s.string("The matching memory text for a memory result.")),
    chunk: s.optional(s.string("The matching content for a document chunk result.")),
    metadata: s.describe(nullableLooseObjectSchema, "Metadata attached to the result."),
    updatedAt: s.string("When the result was last updated."),
    similarity: s.number("The similarity score between the query and result.", {
      minimum: 0,
      maximum: 1,
    }),
  },
  { optional: ["memory", "chunk"] },
);
const searchResultsSchema = s.requiredObject("The search results and timing information.", {
  results: s.array("The matching memories and document chunks.", searchResultSchema),
  timing: s.number("The search execution time in milliseconds."),
  total: s.number("The total number of returned results."),
});
const profileSchema = s.object("The static, dynamic, and bucketed profile information for a container.", {
  static: s.optional(s.stringArray("Long-term profile facts.", { itemDescription: "A long-term profile fact." })),
  dynamic: s.optional(s.stringArray("Recent profile context.", { itemDescription: "A recent profile fact." })),
  buckets: s.optional(
    s.record(
      "Profile facts grouped by configured bucket key.",
      s.stringArray("Facts in this profile bucket.", {
        itemDescription: "A profile bucket fact.",
      }),
    ),
  ),
});
const searchIncludeSchema = s.requiredObject("Optional related data to include with search results.", {
  documents: s.optional(s.boolean("Whether to include associated document details.")),
  summaries: s.optional(s.boolean("Whether to include associated document summaries.")),
  relatedMemories: s.optional(s.boolean("Whether to include related memories.")),
  forgottenMemories: s.optional(s.boolean("Whether to include forgotten memories.")),
});
const documentSchema = s.looseRequiredObject(
  "A Supermemory document and its current processing state.",
  {
    id: s.string("The document identifier."),
    status: s.stringEnum("The current document processing status.", [
      "unknown",
      "queued",
      "extracting",
      "chunking",
      "embedding",
      "indexing",
      "done",
      "failed",
    ]),
    content: s.optional(s.describe(nullableStringSchema, "The extracted document content.")),
    customId: s.optional(s.describe(nullableStringSchema, "The caller-provided document ID.")),
    title: s.optional(s.describe(nullableStringSchema, "The document title.")),
    summary: s.optional(s.describe(nullableStringSchema, "A summary of the document.")),
    type: s.optional(s.string("The detected document type.")),
    taskType: s.optional(s.stringEnum("The document processing task type.", ["memory", "superrag"])),
    metadata: s.optional(s.unknown("Metadata attached to the document.")),
    createdAt: s.optional(s.string("When the document was created.")),
    updatedAt: s.optional(s.string("When the document was last updated.")),
    url: s.optional(s.describe(nullableStringSchema, "The source URL, if present.")),
  },
  {
    optional: [
      "content",
      "customId",
      "title",
      "summary",
      "type",
      "taskType",
      "metadata",
      "createdAt",
      "updatedAt",
      "url",
    ],
  },
);

export const supermemoryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_memories",
    operationType: "write",
    description: "Store one or more already-known facts directly as immediately searchable Supermemory memories.",
    inputSchema: s.requiredObject("The facts and tenant boundary for direct memory creation.", {
      memories: s.array("The exact facts to store.", memoryInputSchema, {
        minItems: 1,
        maxItems: 100,
      }),
      containerTag: containerTagSchema,
    }),
    outputSchema: s.requiredObject("The memories created by Supermemory.", {
      documentId: s.describe(
        nullableStringSchema,
        "The source document identifier created for these memories, if any.",
      ),
      memories: s.array("The created memories.", memorySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "add_document",
    operationType: "write",
    description:
      "Submit raw text, a transcript, or a public URL for asynchronous memory extraction or managed RAG indexing.",
    asyncLifecycle: {
      startActionId: "supermemory.add_document",
      statusActionId: "supermemory.get_document",
    },
    inputSchema: s.requiredObject("The source content and processing behavior for a new document.", {
      content: s.nonEmptyString(
        "Raw text, a conversation transcript, or a public URL that Supermemory should process.",
      ),
      containerTag: containerTagSchema,
      taskType: s.stringEnum("How Supermemory should process the content.", ["memory", "superrag"]),
      customId: s.optional(
        s.nonEmptyString("A stable caller-provided identifier used for idempotency and deletion.", {
          maxLength: 100,
        }),
      ),
      metadata: s.optional(metadataSchema),
      entityContext: s.optional(
        s.string("Context that guides memory extraction for this container.", { maxLength: 1500 }),
      ),
      filterByMetadata: s.optional(
        s.describe(metadataSchema, "Metadata filters for existing memories used as ingestion context."),
      ),
      dreaming: s.optional(
        s.stringEnum("Whether to process immediately or group related documents dynamically.", ["instant", "dynamic"]),
      ),
    }),
    outputSchema: s.requiredObject("The queued Supermemory document.", {
      id: s.string("The document identifier used to poll processing status."),
      status: s.string("The initial document processing status."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_document",
    operationType: "read",
    description:
      "Get a Supermemory document and its current processing status, including the final extracted content when available.",
    asyncLifecycle: {
      startActionId: "supermemory.add_document",
      statusActionId: "supermemory.get_document",
    },
    inputSchema: s.requiredObject("The document to retrieve.", {
      id: s.nonEmptyString("The Supermemory document identifier."),
    }),
    outputSchema: documentSchema,
  }),
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Recall relevant memories, document chunks, or both for a question within one tenant container.",
    inputSchema: s.requiredObject("The recall query, tenant boundary, and optional ranking controls.", {
      q: s.nonEmptyString("The question or semantic search query."),
      containerTag: containerTagSchema,
      searchMode: s.optional(
        s.withDefault(
          s.stringEnum("Which Supermemory indexes should be searched.", ["memories", "hybrid", "documents"]),
          "hybrid",
        ),
      ),
      limit: s.optional(s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 })),
      threshold: s.optional(
        s.number("The minimum relevance sensitivity for returned results.", {
          minimum: 0,
          maximum: 1,
        }),
      ),
      rerank: s.optional(s.boolean("Whether Supermemory should rerank the results.")),
      aggregate: s.optional(s.boolean("Whether Supermemory should synthesize information across matching memories.")),
      rewriteQuery: s.optional(s.boolean("Whether Supermemory should rewrite the query before retrieval.")),
      include: s.optional(searchIncludeSchema),
      filters: s.optional(s.looseObject("An official Supermemory metadata filter expression.")),
    }),
    outputSchema: searchResultsSchema,
  }),
  defineProviderAction(service, {
    name: "get_profile",
    operationType: "read",
    description: "Retrieve long-term, recent, and bucketed profile context for one user or tenant container.",
    inputSchema: s.requiredObject("The tenant boundary and optional profile search controls.", {
      containerTag: containerTagSchema,
      q: s.optional(s.nonEmptyString("A query used to include relevant search results.")),
      threshold: s.optional(
        s.number("The minimum score for optional profile search results.", {
          minimum: 0,
          maximum: 1,
        }),
      ),
      filters: s.optional(s.looseObject("An official Supermemory metadata filter expression.")),
      include: s.optional(
        s.array(
          "The profile sections to return.",
          s.stringEnum("A profile section.", ["static", "dynamic", "buckets"]),
          { minItems: 1 },
        ),
      ),
      buckets: s.optional(
        s.stringArray("Specific profile bucket keys to return.", {
          minItems: 1,
          itemDescription: "A profile bucket key.",
        }),
      ),
    }),
    outputSchema: s.requiredObject("The profile and optional search results returned by Supermemory.", {
      profile: profileSchema,
      searchResults: s.optional(
        s.requiredObject("Search results included when a profile query was supplied.", {
          results: s.array("The profile query results.", s.unknown("A profile search result.")),
          total: s.number("The total number of profile search results."),
          timing: s.number("The profile search execution time in milliseconds."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "update_memory",
    operationType: "write",
    description: "Correct one memory by ID, creating a new version while preserving its prior version history.",
    inputSchema: s.requiredObject("The memory correction and tenant boundary.", {
      memoryId: s.nonEmptyString("The identifier of the memory to update."),
      containerTag: containerTagSchema,
      newContent: s.nonEmptyString("The replacement memory text."),
      metadata: s.optional(metadataSchema),
      forgetAfter: s.optional(
        s.nullable(s.dateTime("When the updated memory should be forgotten, or null to clear its expiry.")),
      ),
      forgetReason: s.optional(s.nullable(s.string("Why the updated memory is scheduled to be forgotten."))),
      temporalContext: s.optional(temporalContextSchema),
    }),
    outputSchema: s.looseRequiredObject("The new memory version created by Supermemory.", {
      id: s.string("The identifier of the new memory version."),
      memory: s.string("The updated memory text."),
      version: s.number("The new memory version number."),
      parentMemoryId: s.describe(nullableStringSchema, "The immediately preceding memory ID."),
      rootMemoryId: s.describe(nullableStringSchema, "The first memory ID in this version chain."),
      createdAt: s.string("When the new memory version was created."),
      forgetAfter: s.describe(nullableStringSchema, "When this version will be forgotten."),
      forgetReason: s.describe(nullableStringSchema, "Why this version will be forgotten."),
      metadata: s.describe(nullableLooseObjectSchema, "Metadata attached to this version."),
    }),
  }),
  defineProviderAction(service, {
    name: "forget_memory",
    operationType: "destructive",
    description: "Soft-delete one memory by ID so it is excluded from normal recall while remaining auditable.",
    inputSchema: s.requiredObject("The memory to forget and its tenant boundary.", {
      memoryId: s.nonEmptyString("The identifier of the memory to forget."),
      containerTag: containerTagSchema,
      reason: s.optional(s.string("Why this memory is being forgotten.")),
    }),
    outputSchema: s.requiredObject("Confirmation that Supermemory forgot the memory.", {
      id: s.string("The forgotten memory identifier."),
      forgotten: s.boolean("Whether the memory was successfully forgotten."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_document",
    operationType: "destructive",
    description: "Permanently delete one source document by its Supermemory ID or caller-provided custom ID.",
    inputSchema: s.requiredObject("The source document to delete.", {
      id: s.nonEmptyString("The Supermemory document ID or caller-provided custom ID."),
    }),
    outputSchema: s.requiredObject("Confirmation that the source document was deleted.", {
      id: s.string("The document ID or custom ID used for deletion."),
      deleted: s.boolean("Whether the document was successfully deleted."),
    }),
  }),
];

export type SupermemoryActionName =
  | "create_memories"
  | "add_document"
  | "get_document"
  | "search"
  | "get_profile"
  | "update_memory"
  | "forget_memory"
  | "delete_document";
