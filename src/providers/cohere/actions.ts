import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cohere";

const jsonObjectSchema = s.looseObject("A JSON object accepted or returned by the Cohere API.");
const apiMetaSchema = s.looseObject("Cohere API metadata including usage and billing details.", {
  api_version: s.looseObject("The Cohere API version metadata.", {
    version: s.string("The API version used for the response."),
    is_deprecated: s.boolean("Whether this API version is deprecated."),
    is_experimental: s.boolean("Whether this API version is experimental."),
  }),
  billed_units: s.looseObject("Billing unit counts reported by Cohere."),
  tokens: s.looseObject("Token usage counts reported by Cohere."),
  warnings: s.array("Warnings returned by Cohere.", s.string("A warning message.")),
});
const chatMessageContentBlockSchema = s.looseRequiredObject("A Cohere chat message content block.", {
  type: s.string("The content block type, such as text or image_url."),
});
const chatMessageContentSchema = s.anyOf("The content of a Cohere chat message.", [
  s.string("Plain text message content."),
  s.array("Structured content blocks for the message.", chatMessageContentBlockSchema, { minItems: 1 }),
]);
const chatMessageSchema = s.object(
  "A message in the conversation sent to the Cohere Chat API.",
  {
    role: s.stringEnum("The author role for the message.", ["system", "user", "assistant", "tool"]),
    content: chatMessageContentSchema,
    tool_calls: s.array("Tool calls made by the assistant message.", jsonObjectSchema),
    tool_call_id: s.string("The identifier of the tool call this tool message responds to."),
  },
  { optional: ["content", "tool_calls", "tool_call_id"] },
);
const chatInputSchema = s.object(
  "Input for generating a synchronous response with the Cohere Chat API.",
  {
    model: s.nonEmptyString("The name of a compatible Cohere chat model."),
    messages: s.array("The ordered conversation messages to send to Cohere.", chatMessageSchema, { minItems: 1 }),
    tools: s.array("Function tools available to the model.", jsonObjectSchema),
    strict_tools: s.boolean("Whether tool calls must strictly follow the tool definition."),
    documents: s.array(
      "Documents that the model can cite while generating the response.",
      s.anyOf("A document supplied to the model.", [s.string("Document text."), jsonObjectSchema]),
    ),
    citation_options: jsonObjectSchema,
    response_format: jsonObjectSchema,
    safety_mode: s.string("The Cohere safety mode to use for the request."),
    max_tokens: s.integer("The maximum number of output tokens the model will generate."),
    stop_sequences: s.array("Stop sequences that halt generation.", s.string("A stop sequence."), { maxItems: 5 }),
    temperature: s.number("Randomness used for generation."),
    seed: s.integer("A best-effort deterministic sampling seed."),
    frequency_penalty: s.number("Penalty used to reduce repeated tokens."),
    presence_penalty: s.number("Penalty used to reduce reused token content."),
    k: s.integer("Top-k sampling value. Use 0 to disable k-sampling."),
    p: s.number("Top-p sampling value."),
    logprobs: s.boolean("Whether to include generated-token log probabilities."),
    tool_choice: s.anyOf("Tool selection behavior for the model.", [
      s.string("A predefined tool choice value."),
      jsonObjectSchema,
    ]),
    thinking: jsonObjectSchema,
    priority: s.integer("Lower values are handled earlier by Cohere."),
  },
  {
    optional: [
      "tools",
      "strict_tools",
      "documents",
      "citation_options",
      "response_format",
      "safety_mode",
      "max_tokens",
      "stop_sequences",
      "temperature",
      "seed",
      "frequency_penalty",
      "presence_penalty",
      "k",
      "p",
      "logprobs",
      "tool_choice",
      "thinking",
      "priority",
    ],
  },
);
const chatOutputSchema = s.looseRequiredObject("The response returned by the Cohere Chat API.", {
  id: s.string("The unique Cohere response identifier."),
  finish_reason: s.string("Why generation finished."),
  message: s.looseObject("The assistant message returned by Cohere.", {
    role: s.string("The role of the returned message."),
    content: s.array("Content blocks returned by the assistant message.", jsonObjectSchema),
    tool_calls: s.array("Tool calls returned by Cohere.", jsonObjectSchema),
  }),
  usage: s.looseObject("Usage statistics returned by Cohere."),
});
const embedInputTypeSchema = s.stringEnum("The type of input passed to the embedding model.", [
  "search_document",
  "search_query",
  "classification",
  "clustering",
]);
const embeddingTypeSchema = s.stringEnum("The embedding representation to return.", [
  "float",
  "int8",
  "uint8",
  "binary",
  "ubinary",
  "base64",
]);
const embedInputSchema = s.object(
  "Input for generating text embeddings with the Cohere Embed API.",
  {
    model: s.nonEmptyString("The Cohere embedding model identifier."),
    input_type: embedInputTypeSchema,
    texts: s.array("Text strings for the model to embed.", s.string("A text value to embed."), {
      minItems: 1,
      maxItems: 96,
    }),
    max_tokens: s.integer("The maximum number of tokens to embed per input."),
    output_dimension: s.integer("The number of dimensions for embed-v4 and newer models."),
    embedding_types: s.array("Embedding representations to return.", embeddingTypeSchema, { minItems: 1 }),
    truncate: s.stringEnum("How Cohere handles inputs longer than the model limit.", ["NONE", "START", "END"]),
    priority: s.integer("Lower values are handled earlier by Cohere."),
  },
  { optional: ["max_tokens", "output_dimension", "embedding_types", "truncate", "priority"] },
);
const embedOutputSchema = s.looseRequiredObject("The response returned by the Cohere Embed API.", {
  id: s.string("The unique Cohere response identifier."),
  embeddings: s.looseObject("Embeddings grouped by requested representation type."),
  texts: s.array("Text inputs echoed by Cohere.", s.string("A text input.")),
  meta: apiMetaSchema,
});
const rerankInputSchema = s.object(
  "Input for ranking documents by relevance with the Cohere Rerank API.",
  {
    model: s.nonEmptyString("The Cohere rerank model identifier."),
    query: s.nonEmptyString("The search query used to rank documents."),
    documents: s.array("Texts that will be compared to the query.", s.string("A text document to rank."), {
      minItems: 1,
    }),
    top_n: s.integer("Maximum number of rerank results to return."),
    max_tokens_per_doc: s.integer("Maximum tokens to keep per document before ranking."),
    priority: s.integer("Lower values are handled earlier by Cohere."),
  },
  { optional: ["top_n", "max_tokens_per_doc", "priority"] },
);
const rerankResultSchema = s.object("A ranked document result returned by Cohere.", {
  index: s.integer("The original zero-based index of the ranked document."),
  relevance_score: s.number("Normalized relevance score between 0 and 1."),
});
const rerankOutputSchema = s.looseRequiredObject("The response returned by the Cohere Rerank API.", {
  id: s.string("The unique Cohere response identifier."),
  results: s.array("Ranked document results.", rerankResultSchema),
  meta: apiMetaSchema,
});

export const cohereActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "chat",
    operationType: "read",
    description: "Generate a synchronous text response using the Cohere Chat API.",
    inputSchema: chatInputSchema,
    outputSchema: chatOutputSchema,
  }),
  defineProviderAction(service, {
    name: "embed_texts",
    operationType: "write",
    description: "Generate embeddings for text inputs using the Cohere Embed API.",
    inputSchema: embedInputSchema,
    outputSchema: embedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "rerank_documents",
    operationType: "read",
    description: "Rank text documents by relevance to a query using the Cohere Rerank API.",
    inputSchema: rerankInputSchema,
    outputSchema: rerankOutputSchema,
  }),
];
