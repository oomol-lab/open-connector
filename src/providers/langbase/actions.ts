import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "langbase";

const langbaseEmbeddingModels = [
  "openai:text-embedding-3-large",
  "cohere:embed-v4.0",
  "cohere:embed-multilingual-v3.0",
  "cohere:embed-multilingual-light-v3.0",
  "google:text-embedding-004",
];

const memorySummarySchema = s.object(
  "A Langbase memory summary.",
  {
    name: s.string("The memory name."),
    description: s.string("The memory description."),
    ownerLogin: s.string("The login of the memory owner."),
    url: s.url("The Langbase Studio URL for the memory."),
    chunkSize: s.integer("The configured chunk size for this memory."),
    chunkOverlap: s.integer("The configured chunk overlap for this memory."),
    embeddingModel: s.stringEnum("The embedding model configured for this memory.", langbaseEmbeddingModels),
  },
  { optional: ["chunkSize", "chunkOverlap", "embeddingModel"] },
);

const retrieveMemoryRefSchema = s.object(
  "A memory reference used during retrieval.",
  {
    name: s.nonEmptyString("The name of the memory to search."),
    filters: s.unknown(
      'Optional Langbase memory filters forwarded as-is, such as ["field", "Eq", "value"] or nested ["And"|"Or", ...] filter trees.',
    ),
  },
  { optional: ["filters"] },
);

const retrieveMatchSchema = s.object("A single retrieved Langbase memory chunk.", {
  text: s.string("The retrieved text segment."),
  similarity: s.number("The similarity score returned by Langbase."),
  meta: s.record("Additional metadata returned for the retrieved chunk.", s.string("A metadata value.")),
});

export const langbaseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_memories",
    description:
      "List Langbase memories available to the connected User or Org API key and return stable memory summaries.",
    requiredScopes: [],
    inputSchema: s.object("This action does not require any input parameters.", {}),
    outputSchema: s.object("The Langbase memories returned by the list endpoint.", {
      memories: s.array("The Langbase memories returned by the API.", memorySummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_memory",
    description:
      "Create a Langbase memory with the official Memory Create API and return the normalized created memory summary.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating a Langbase memory.",
      {
        name: s.nonEmptyString("The memory name."),
        description: s.string("A short description of the memory."),
        embedding_model: s.stringEnum("The embedding model to use for the memory.", langbaseEmbeddingModels),
        chunk_size: s.integer("The maximum number of characters in a chunk.", { maximum: 30000 }),
        chunk_overlap: s.integer("The number of overlapping characters between adjacent chunks.", { minimum: 0 }),
        top_k: s.integer("The default number of chunks to return during retrieval.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { optional: ["description", "embedding_model", "chunk_size", "chunk_overlap", "top_k"] },
    ),
    outputSchema: s.object("The normalized Langbase memory returned by create.", {
      memory: memorySummarySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_memory",
    description: "Delete an existing Langbase memory by name and return whether the delete request succeeded.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for deleting a Langbase memory.", {
      memoryName: s.nonEmptyString("The Langbase memory name to delete."),
    }),
    outputSchema: s.object("The Langbase delete result.", {
      success: s.boolean("Whether Langbase deleted the memory successfully."),
    }),
  }),
  defineProviderAction(service, {
    name: "retrieve_memory",
    description: "Retrieve similar chunks from one or more Langbase memories with the official Memory Retrieve API.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving similar chunks from Langbase memories.",
      {
        query: s.nonEmptyString("The search query used to retrieve similar chunks."),
        memory: s.array("The Langbase memories to search.", retrieveMemoryRefSchema, {
          minItems: 1,
        }),
        topK: s.integer("The number of top chunks to return.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { optional: ["topK"] },
    ),
    outputSchema: s.object("The normalized Langbase retrieval results.", {
      matches: s.array("The retrieved Langbase memory matches.", retrieveMatchSchema),
    }),
  }),
];
