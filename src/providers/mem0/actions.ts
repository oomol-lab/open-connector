import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mem0";

const looseObjectSchema = s.looseObject("An arbitrary JSON object returned by Mem0.");
const stringMapSchema = s.record(
  "A map of custom category names to their descriptions.",
  s.string("A category description."),
);
const nullableStringSchema = s.nullableString("A string value returned by Mem0, or null.");
const messageSchema = s.object("A single message used to create or update memory.", {
  role: s.nonEmptyString("The message role, such as user or assistant."),
  content: s.nonEmptyString("The text content of the message."),
});
const memorySchema = s.looseObject("A Mem0 memory object.", {
  id: s.string("The unique identifier of the memory."),
  memory: s.string("The memory text content."),
  text: s.string("The updated memory text returned by some write operations."),
  hash: s.string("The content hash of the memory."),
  user_id: s.string("The associated user identifier."),
  agent_id: s.string("The associated agent identifier."),
  app_id: s.string("The associated application identifier."),
  run_id: s.string("The associated run identifier."),
  metadata: looseObjectSchema,
  categories: s.array("The categories assigned to the memory.", s.string("One category.")),
  created_at: s.string("The timestamp when the memory was created."),
  updated_at: s.string("The timestamp when the memory was last updated."),
  expiration_date: s.string("The expiration date of the memory."),
  score: s.number("The relevance score returned by search results."),
  input: s.array("The input messages used to generate the memory.", messageSchema),
  structured_attributes: s.looseObject("Structured attributes extracted from the memory."),
});
const addMemoryDataSchema = s.looseObject("The nested memory payload returned by Mem0.", {
  memory: s.string("The generated memory text returned by Mem0."),
  structured_attributes: s.looseObject("The structured attributes extracted for the generated memory."),
});
const addMemoryQueuedResultSchema = s.object("An asynchronous add_memories result item.", {
  event_id: s.string("The asynchronous event identifier."),
  status: s.string("The asynchronous processing status."),
  message: s.string("A status message for asynchronous processing."),
});
const addMemoryProcessedTopLevelSchema = s.looseObject(
  "A processed add_memories result item with top-level memory fields.",
  {
    id: s.string("The identifier of the created or updated memory."),
    event: s.string("The event type associated with this result."),
    memory: s.string("The generated memory text returned by Mem0."),
    structured_attributes: s.looseObject("The structured attributes extracted for the generated memory."),
  },
);
const addMemoryProcessedNestedSchema = s.looseObject("A processed add_memories result item with nested data.", {
  id: s.string("The identifier of the created or updated memory."),
  event: s.string("The event type associated with this result."),
  data: addMemoryDataSchema,
});
const addMemoryResultSchema = s.union(
  [addMemoryQueuedResultSchema, addMemoryProcessedTopLevelSchema, addMemoryProcessedNestedSchema],
  {
    description: "A single result item returned by add_memories.",
  },
);
const historyEntrySchema = s.looseObject("A Mem0 memory history record.", {
  id: s.string("The unique identifier of the history entry."),
  memory_id: s.string("The identifier of the related memory."),
  event: s.string("The history event type."),
  old_memory: nullableStringSchema,
  new_memory: nullableStringSchema,
  input: s.array("The input messages that triggered the change.", messageSchema),
  metadata: looseObjectSchema,
  created_at: s.string("The timestamp when the history entry was created."),
  updated_at: s.string("The timestamp when the history entry was last updated."),
  user_id: s.string("The associated user identifier."),
});
const eventSchema = s.looseObject("A Mem0 event object.", {
  id: s.string("The unique identifier of the event."),
  event_type: s.string("The event type."),
  status: s.string("The processing status of the event."),
  payload: s.looseObject("The raw request payload captured for the event."),
  results: s.array("The list of event processing results.", s.unknown("One event processing result.")),
  metadata: looseObjectSchema,
  latency: s.nullableNumber("The event processing latency in milliseconds."),
  graph_status: s.unknown("The graph-memory processing status."),
  created_at: s.string("The timestamp when the event was created."),
  updated_at: s.string("The timestamp when the event was last updated."),
  started_at: nullableStringSchema,
  completed_at: nullableStringSchema,
});
const eventListSchema = s.object(
  "A paginated Mem0 event response.",
  {
    count: s.number("The total number of events matching the current query."),
    next: nullableStringSchema,
    previous: nullableStringSchema,
    results: s.array("The list of event records.", eventSchema),
  },
  { optional: ["next", "previous"] },
);
const userSchema = s.looseObject("A Mem0 user entity.", {
  id: s.string("The unique identifier of the user entity."),
  name: s.string("The display name of the user entity."),
  type: s.string("The entity type."),
  owner: s.string("The owner of the entity."),
  metadata: looseObjectSchema,
  created_at: s.string("The timestamp when the user entity was created."),
  updated_at: s.string("The timestamp when the user entity was last updated."),
});
const userListSchema = s.object(
  "A paginated Mem0 user entity response.",
  {
    entity_type: s.string("The entity type returned by the current query."),
    count: s.number("The total number of user entities."),
    next: nullableStringSchema,
    previous: nullableStringSchema,
    results: s.array("The list of user entities.", userSchema),
  },
  { optional: ["entity_type", "next", "previous"] },
);

const addMemoriesInputSchema = s.object(
  "The input payload for adding memories to Mem0.",
  {
    memory: s.nonEmptyString("A single memory string to write directly."),
    messages: s.array("The list of messages used to generate memory.", messageSchema, { minItems: 1 }),
    user_id: s.nonEmptyString("The associated user identifier."),
    agent_id: s.nonEmptyString("The associated agent identifier."),
    app_id: s.nonEmptyString("The associated application identifier."),
    run_id: s.nonEmptyString("The associated run identifier."),
    org_id: s.nonEmptyString("An optional organization identifier."),
    project_id: s.nonEmptyString("An optional project identifier."),
    metadata: looseObjectSchema,
    custom_categories: stringMapSchema,
    enable_graph: s.boolean("Whether graph memory extraction should be enabled for this request."),
    infer: s.boolean("Whether Mem0 should infer structured memory from the messages."),
    async_mode: s.boolean("Whether the write should be processed asynchronously."),
    output_format: s.stringEnum("The response wrapper format version.", ["v1.0", "v1.1"]),
    version: s.stringEnum("The memory extraction engine version.", ["v1", "v2"]),
    custom_instructions: s.nonEmptyString("Additional instructions used to guide memory extraction."),
    immutable: s.boolean("Whether the created memory should be treated as immutable."),
    timestamp: s.integer("The Unix timestamp associated with the memory input."),
    expiration_date: s.nonEmptyString("The expiration date to attach to the created memory."),
    includes: s.nonEmptyString("A string list of keywords that should be prioritized."),
    excludes: s.nonEmptyString("A string list of keywords that should be excluded."),
  },
  {
    optional: [
      "memory",
      "messages",
      "user_id",
      "agent_id",
      "app_id",
      "run_id",
      "org_id",
      "project_id",
      "metadata",
      "custom_categories",
      "enable_graph",
      "infer",
      "async_mode",
      "output_format",
      "version",
      "custom_instructions",
      "immutable",
      "timestamp",
      "expiration_date",
      "includes",
      "excludes",
    ],
  },
);

const getMemoriesInputSchema = s.object(
  "The input payload for listing memories with advanced filters.",
  {
    filters: s.looseObject("The advanced filter object supported by the Mem0 v2 memories API."),
    page: s.integer("The page number to request, starting from 1.", { minimum: 1 }),
    page_size: s.integer("The maximum number of results per page, up to 100.", { minimum: 1, maximum: 100 }),
    org_id: s.nonEmptyString("An optional organization identifier."),
    project_id: s.nonEmptyString("An optional project identifier."),
  },
  { optional: ["page", "page_size", "org_id", "project_id"] },
);

const searchMemoriesInputSchema = s.object(
  "The input payload for searching memories in Mem0.",
  {
    query: s.nonEmptyString("The natural-language query used for semantic search."),
    filters: s.looseObject("An optional advanced filter object."),
    top_k: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 }),
    rerank: s.boolean("Whether Mem0 should rerank the initial search results."),
    threshold: s.number("The semantic similarity threshold."),
    fields: s.stringArray("The list of fields to return.", { minItems: 1 }),
    keyword_search: s.boolean("Whether Mem0 should perform keyword search instead of semantic search."),
    filter_memories: s.boolean("Whether Mem0 should strictly apply the provided filters."),
    org_id: s.nonEmptyString("An optional organization identifier."),
    project_id: s.nonEmptyString("An optional project identifier."),
  },
  {
    optional: [
      "filters",
      "top_k",
      "rerank",
      "threshold",
      "fields",
      "keyword_search",
      "filter_memories",
      "org_id",
      "project_id",
    ],
  },
);

const memoryIdField = s.nonEmptyString("The unique identifier of the target memory.");
const eventIdField = s.nonEmptyString("The unique identifier of the target event.");
const getMemoryInputSchema = s.object("The input payload for retrieving a single Mem0 memory.", {
  memory_id: memoryIdField,
});
const updateMemoryInputSchema = s.object(
  "The input payload for updating a Mem0 memory.",
  {
    memory_id: memoryIdField,
    text: s.nonEmptyString("The new memory text to store."),
    metadata: looseObjectSchema,
  },
  { optional: ["text", "metadata"] },
);
const deleteMemoryInputSchema = s.object("The input payload for deleting a Mem0 memory.", {
  memory_id: memoryIdField,
});
const getMemoryHistoryInputSchema = s.object("The input payload for retrieving Mem0 memory history.", {
  memory_id: memoryIdField,
});
const getEventsInputSchema = s.object(
  "The input payload for listing Mem0 events.",
  {
    event_type: s.nonEmptyString("Filter events by event type."),
    start_date: s.nonEmptyString("The start date filter, typically in YYYY-MM-DD format."),
    end_date: s.nonEmptyString("The end date filter, typically in YYYY-MM-DD format."),
    page: s.integer("The page number to request, starting from 1.", { minimum: 1 }),
    page_size: s.integer("The maximum number of results per page, up to 100.", { minimum: 1, maximum: 100 }),
  },
  { optional: ["event_type", "start_date", "end_date", "page", "page_size"] },
);
const getEventInputSchema = s.object("The input payload for retrieving a single Mem0 event.", {
  event_id: eventIdField,
});
const getUsersInputSchema = s.object(
  "The input payload for listing Mem0 user entities.",
  {
    org_id: s.nonEmptyString("An optional organization identifier."),
    project_id: s.nonEmptyString("An optional project identifier."),
  },
  { optional: ["org_id", "project_id"] },
);

export const mem0Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "add_memories",
    description: "Add new memories to Mem0 from messages or direct memory text.",
    inputSchema: addMemoriesInputSchema,
    outputSchema: s.union(
      [
        s.array("The list of memory creation results.", addMemoryResultSchema),
        s.object("A memory creation response wrapped in the v1.1 format.", {
          results: s.array("The list of memory creation results.", addMemoryResultSchema),
        }),
      ],
      { description: "The response payload for mem0.add_memories." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_memories",
    description: "List memories from Mem0 with v2 advanced filters.",
    inputSchema: getMemoriesInputSchema,
    outputSchema: s.array("The list of Mem0 memories matching the advanced filters.", memorySchema),
  }),
  defineProviderAction(service, {
    name: "search_memories",
    description: "Search memories in Mem0 with semantic query and optional filters.",
    inputSchema: searchMemoriesInputSchema,
    outputSchema: s.array("The list of memories returned by semantic search.", memorySchema),
  }),
  defineProviderAction(service, {
    name: "get_memory",
    description: "Get a single memory from Mem0 by memory ID.",
    inputSchema: getMemoryInputSchema,
    outputSchema: memorySchema,
  }),
  defineProviderAction(service, {
    name: "update_memory",
    description: "Update text or metadata of a Mem0 memory by memory ID.",
    inputSchema: updateMemoryInputSchema,
    outputSchema: memorySchema,
  }),
  defineProviderAction(service, {
    name: "delete_memory",
    description: "Delete a Mem0 memory by memory ID.",
    inputSchema: deleteMemoryInputSchema,
    outputSchema: s.object("The explicit acknowledgment object returned after deleting a Mem0 memory.", {
      memory_id: s.string("The identifier of the deleted memory."),
      deleted: s.boolean("Whether the memory was deleted successfully."),
      message: s.string("A deletion status message."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_memory_history",
    description: "Get the change history of a Mem0 memory by memory ID.",
    inputSchema: getMemoryHistoryInputSchema,
    outputSchema: s.array("The history entries for the requested memory.", historyEntrySchema),
  }),
  defineProviderAction(service, {
    name: "get_events",
    description: "List Mem0 events for the current API key.",
    inputSchema: getEventsInputSchema,
    outputSchema: eventListSchema,
  }),
  defineProviderAction(service, {
    name: "get_event",
    description: "Get a single Mem0 event by event ID.",
    inputSchema: getEventInputSchema,
    outputSchema: eventSchema,
  }),
  defineProviderAction(service, {
    name: "get_users",
    description: "List user entities from Mem0, optionally scoped by org and project.",
    inputSchema: getUsersInputSchema,
    outputSchema: userListSchema,
  }),
];
