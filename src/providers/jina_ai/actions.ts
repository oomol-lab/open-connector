import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jina_ai";
const looseObject = s.looseObject("A JSON object returned by Jina AI.");

const embeddingsInput = s.object(
  "Input for generating embeddings with Jina AI.",
  {
    model: s.string("The Jina AI embedding model identifier."),
    input: s.array(
      "The texts or multimodal inputs to embed.",
      s.anyOf("A text or multimodal embedding input.", [s.string("Text to embed."), looseObject]),
      { minItems: 1 },
    ),
    encoding_format: s.string("The encoding format for returned embeddings."),
    dimensions: s.integer("The requested embedding dimensionality."),
    normalized: s.boolean("Whether returned embeddings should be normalized."),
  },
  { optional: ["encoding_format", "dimensions", "normalized"] },
);

const rerankInput = s.object(
  "Input for ranking documents by relevance with Jina AI.",
  {
    model: s.string("The Jina AI reranker model identifier."),
    query: s.string("The query used to rank documents."),
    documents: s.array("The documents to rank.", s.string("A document to rank."), {
      minItems: 1,
    }),
    top_n: s.integer("The maximum number of results to return."),
    return_documents: s.boolean("Whether to include document text in each result."),
  },
  { optional: ["top_n", "return_documents"] },
);

export const jinaAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_embeddings",
    operationType: "write",
    description: "Create vector embeddings for text or multimodal inputs with Jina AI.",
    inputSchema: embeddingsInput,
    outputSchema: looseObject,
  }),
  defineProviderAction(service, {
    name: "rerank_documents",
    operationType: "read",
    description: "Rank documents by relevance to a query with Jina AI.",
    inputSchema: rerankInput,
    outputSchema: looseObject,
  }),
];
