import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "metaso";

const looseObjectSchema = s.unknownObject("A JSON object returned by Metaso.");
const looseObjectArraySchema = s.array("A list of JSON objects returned by Metaso.", looseObjectSchema);
const scopeSchema = s.stringEnum("The Metaso search scope.", [
  "webpage",
  "document",
  "paper",
  "scholar",
  "image",
  "video",
  "podcast",
]);
const modelSchema = s.stringEnum("The Metaso chat model identifier.", ["fast", "fast_thinking", "ds-r1"]);
const readerFormatSchema = s.stringEnum("The output format returned by the Metaso reader.", ["markdown", "json"]);
const chatRoleSchema = s.stringEnum("The message author role.", ["system", "user", "assistant"]);

const searchResultSchema = s.object(
  "One Metaso search result item.",
  {
    title: s.string("The result title."),
    link: s.string("The canonical result URL."),
    score: s.string("The relevance score label returned by Metaso."),
    snippet: s.string("The snippet returned by Metaso."),
    position: s.integer("The one-based result position."),
    authors: s.array("The author list returned by Metaso.", s.string("One author name returned by Metaso.")),
    date: s.string("The published date returned by Metaso."),
  },
  {
    optional: ["score", "snippet", "position", "authors", "date"],
    additionalProperties: true,
  },
);

const searchOutputSchema = s.object(
  "The response payload for the Metaso search action.",
  {
    credits: s.integer("The credit cost reported by Metaso."),
    searchParameters: looseObjectSchema,
    webpages: s.array("The webpage results returned by Metaso.", searchResultSchema),
    scholars: s.array("The scholar results returned by Metaso.", searchResultSchema),
    documents: s.array("The document results returned by Metaso.", searchResultSchema),
    images: looseObjectArraySchema,
    videos: looseObjectArraySchema,
    podcasts: looseObjectArraySchema,
    total: s.integer("The total number of matched results."),
  },
  {
    optional: ["webpages", "scholars", "documents", "images", "videos", "podcasts", "total"],
    additionalProperties: true,
  },
);

const readerJsonOutputSchema = s.object(
  "The JSON response payload for the Metaso reader action.",
  {
    title: s.string("The webpage title extracted by Metaso."),
    url: s.string("The source URL that was read."),
    author: s.string("The author name extracted by Metaso."),
    date: s.string("The published date extracted by Metaso."),
    markdown: s.string("The extracted markdown body."),
    credits: s.integer("The credit cost reported by Metaso."),
  },
  { additionalProperties: true },
);

const chatMessageSchema = s.requiredObject("A chat message sent to Metaso.", {
  role: chatRoleSchema,
  content: s.string("The plain-text message content."),
});

const chatChoiceMessageSchema = s.object(
  "The assistant message payload returned by Metaso.",
  {
    role: s.string("The assistant role returned by Metaso."),
    content: s.string("The assistant message content."),
    citations: s.nullable(looseObjectArraySchema),
    highlights: s.nullable(looseObjectArraySchema),
    reasoning_content: s.nullable(s.string("The optional reasoning content returned by Metaso.")),
  },
  {
    optional: ["role", "content", "citations", "highlights", "reasoning_content"],
    additionalProperties: true,
  },
);

const chatChoiceSchema = s.object(
  "One chat completion choice returned by Metaso.",
  {
    index: s.integer("The choice index."),
    message: chatChoiceMessageSchema,
    delta: s.nullable(looseObjectSchema),
    finish_reason: s.string("The reason why generation stopped."),
    logprobs: s.nullable(looseObjectSchema),
  },
  {
    optional: ["message", "delta", "finish_reason", "logprobs"],
    additionalProperties: true,
  },
);

const chatUsageSchema = s.object(
  "The usage payload returned by Metaso.",
  {
    credits: s.integer("The credit cost reported by Metaso."),
    prompt_tokens: s.integer("The prompt token count."),
    completion_tokens: s.integer("The completion token count."),
    total_tokens: s.integer("The total token count."),
    prompt_tokens_details: s.nullable(looseObjectSchema),
  },
  {
    optional: ["credits", "prompt_tokens", "completion_tokens", "total_tokens", "prompt_tokens_details"],
    additionalProperties: true,
  },
);

const chatCompletionOutputSchema = s.object(
  "The non-streaming response payload for Metaso chat completions.",
  {
    id: s.string("The chat completion identifier."),
    object: s.string("The object type returned by Metaso."),
    created: s.integer("The Unix timestamp when the response was created."),
    model: s.string("The model identifier used for the response."),
    choices: s.array("The completion choices.", chatChoiceSchema),
    usage: chatUsageSchema,
    result_id: s.nullable(s.string("The optional result identifier.")),
  },
  {
    optional: ["model", "usage", "result_id"],
    additionalProperties: true,
  },
);

const chatStreamChunkSchema = s.object(
  "One streamed Metaso chat completion chunk.",
  {
    id: s.string("The chat completion identifier."),
    object: s.string("The object type returned by Metaso."),
    created: s.integer("The Unix timestamp when the chunk was created."),
    model: s.string("The model identifier used for the response."),
    choices: s.array("The streamed completion choices.", chatChoiceSchema),
    usage: chatUsageSchema,
    result_id: s.nullable(s.string("The optional result identifier.")),
  },
  {
    optional: ["model", "usage", "result_id"],
    additionalProperties: true,
  },
);

const chatInputProperties: Record<string, JsonSchema> = {
  scope: scopeSchema,
  model: modelSchema,
  conciseSnippet: s.boolean("Whether to request concise snippets in grounding results."),
  messages: s.array("The ordered chat messages.", chatMessageSchema, { minItems: 1 }),
  message: s.string("A convenience single user message that is converted into messages."),
  stream: s.boolean("Whether to request a streaming response. Use the action that matches the desired mode."),
};

export const metasoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Search webpages, documents, papers, images, videos, or podcasts with the Metaso search API.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for the Metaso search action.",
      {
        q: s.nonEmptyString("The search query."),
        scope: scopeSchema,
        includeSummary: s.boolean("Whether Metaso should use webpage summaries to improve recall."),
        includeRawContent: s.boolean("Whether Metaso should fetch raw webpage content."),
        size: s.integer("The maximum number of results to return.", {
          minimum: 1,
          maximum: 100,
        }),
        page: s.integer("The one-based results page number to return.", { minimum: 1 }),
        conciseSnippet: s.boolean("Whether to return concise snippet matches."),
      },
      {
        required: ["q"],
      },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "read_webpage",
    operationType: "read",
    description:
      "Read one webpage with Metaso and return either the extracted markdown string or the structured JSON payload.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for the Metaso reader action.", {
      url: s.url("The webpage URL to read."),
      format: readerFormatSchema,
    }),
    outputSchema: s.union([s.string("The markdown string returned when format is markdown."), readerJsonOutputSchema], {
      description: "The response payload for the Metaso webpage reader action.",
    }),
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    operationType: "read",
    description: "Create one non-streaming Metaso chat completion grounded by the requested Metaso scope.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for the Metaso non-streaming chat completion action.",
      chatInputProperties,
      {
        optional: ["scope", "model", "conciseSnippet", "messages", "message", "stream"],
      },
    ),
    outputSchema: chatCompletionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_chat_completion_stream",
    operationType: "write",
    description:
      "Consume a streamed Metaso chat completion and return the ordered chunks plus aggregated assistant content.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for the Metaso streaming chat completion action.", chatInputProperties, {
      optional: ["scope", "model", "conciseSnippet", "messages", "message", "stream"],
    }),
    outputSchema: s.requiredObject("The aggregated streamed response payload for Metaso chat completions.", {
      chunks: s.array("The ordered stream chunks.", chatStreamChunkSchema),
      finalChunk: s.nullable(chatStreamChunkSchema),
      combinedContent: s.string("The concatenated assistant content from stream deltas."),
    }),
  }),
] as ActionDefinition[];
