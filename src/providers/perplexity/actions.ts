import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "perplexity";

const messageSchema = s.object("A chat message.", {
  role: s.stringEnum("The role of the message author.", ["system", "user", "assistant"]),
  content: s.string("The plain-text message content."),
});

const modelSchema = s.object(
  "A Perplexity model entry.",
  {
    id: s.string("The model identifier."),
    object: s.string("The object type returned by the API."),
    created: s.integer("The Unix timestamp when the model metadata was created."),
    owned_by: s.string("The organization or owner that provides the model."),
    type: s.string("The model family or type."),
  },
  { optional: ["object", "created", "owned_by", "type"], additionalProperties: true },
);

const searchResultSchema = s.object(
  "A raw search result returned by Perplexity.",
  {
    title: s.string("The search result title."),
    url: s.string("The canonical URL of the result."),
    snippet: s.string("A short snippet extracted from the result page."),
    date: s.string("The published date reported for the result."),
    last_updated: s.string("The last updated date reported for the result."),
  },
  { optional: ["title", "url", "snippet", "date", "last_updated"], additionalProperties: true },
);

const tokenUsageSchema = s.object(
  "Token usage metadata for the completion.",
  {
    prompt_tokens: s.integer("The number of prompt tokens consumed."),
    completion_tokens: s.integer("The number of completion tokens generated."),
    total_tokens: s.integer("The total number of tokens consumed."),
  },
  { optional: ["prompt_tokens", "completion_tokens", "total_tokens"], additionalProperties: true },
);

const stringOrStringArray = (description: string, itemDescription: string, options: { maxItems?: number } = {}) =>
  s.anyOf(description, [
    s.nonEmptyString(description),
    s.array(itemDescription, s.nonEmptyString(itemDescription), { minItems: 1, maxItems: options.maxItems }),
  ]);

export const perplexityActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "List the models currently available from Perplexity.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object(
      "The response payload for listing Perplexity models.",
      {
        object: s.string("The top-level object type."),
        data: s.array("The list of available models.", modelSchema),
      },
      { optional: ["object"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "search",
    description: "Search the web and return ranked raw results from Perplexity without LLM synthesis.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for the raw Perplexity web search action.",
      {
        query: stringOrStringArray("One or more raw web search queries.", "One raw web search query."),
        country: s.string("The ISO 3166-1 alpha-2 country code used to localize search results.", {
          minLength: 2,
          maxLength: 2,
        }),
        max_results: s.integer("The maximum number of search results to return.", { minimum: 1, maximum: 20 }),
        search_after_date: s.string("Only return content published after this date, for example 01/15/2024."),
        search_before_date: s.string("Only return content published before this date, for example 12/31/2024."),
        max_tokens_per_page: s.positiveInteger("The maximum number of tokens to retrieve from each webpage."),
        search_domain_filter: s.array(
          "Only return search results from these domains or URL prefixes.",
          s.nonEmptyString("A domain or URL prefix used to filter results."),
          { maxItems: 20 },
        ),
      },
      {
        optional: [
          "country",
          "max_results",
          "search_after_date",
          "search_before_date",
          "max_tokens_per_page",
          "search_domain_filter",
        ],
      },
    ),
    outputSchema: s.looseObject("The response payload for the raw search action.", {
      results: s.array("The ranked raw search results.", searchResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Create a Perplexity Sonar chat completion grounded by web search when enabled.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for the Perplexity chat completion action.",
      {
        model: s.string("The Sonar model to use for the chat completion."),
        messages: s.array("The ordered conversation messages.", messageSchema, { minItems: 1 }),
        max_tokens: s.positiveInteger("The maximum number of tokens to generate."),
        temperature: s.number("The sampling temperature for generation.", { minimum: 0, maximum: 2 }),
        top_p: s.number("The nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
        top_k: s.nonNegativeInteger("The number of top tokens to consider per step."),
        stream: s.boolean("Whether to stream the response. This connector only accepts false or an omitted value."),
        return_images: s.boolean("Whether to include image references in the response."),
        return_citations: s.boolean("Whether to include citations in the response."),
        disable_search: s.boolean("Whether to disable web search grounding for this request."),
        search_domain_filter: s.stringArray("Only search within these domains or URL prefixes.", {
          itemDescription: "A domain or URL prefix used to limit web search.",
        }),
        search_recency_filter: s.string("A recency filter such as day, week, month, or year."),
        presence_penalty: s.number("The penalty applied to tokens that have already appeared.", {
          minimum: -2,
          maximum: 2,
        }),
        frequency_penalty: s.number("The penalty applied based on token frequency.", { minimum: 0, maximum: 2 }),
      },
      {
        optional: [
          "max_tokens",
          "temperature",
          "top_p",
          "top_k",
          "stream",
          "return_images",
          "return_citations",
          "disable_search",
          "search_domain_filter",
          "search_recency_filter",
          "presence_penalty",
          "frequency_penalty",
        ],
      },
    ),
    outputSchema: s.object(
      "The response payload for the chat completion action.",
      {
        id: s.string("The completion identifier."),
        model: s.string("The model that generated the completion."),
        created: s.integer("The Unix timestamp when the completion was created."),
        choices: s.array(
          "The completion choices.",
          s.looseObject("A single generated completion choice.", {
            index: s.integer("The choice index."),
            finish_reason: s.string("The reason why generation stopped."),
            message: s.looseObject("The generated message.", {
              role: s.string("The role of the generated message."),
              content: s.string("The generated message content."),
            }),
          }),
        ),
        citations: s.stringArray("The citation URLs referenced by the answer.", {
          itemDescription: "A citation URL returned with the response.",
        }),
        search_results: s.array("The search results used to ground the response.", searchResultSchema),
        usage: tokenUsageSchema,
      },
      { optional: ["id", "model", "created", "citations", "search_results", "usage"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "create_embeddings",
    description: "Generate vector embeddings for one or more input strings with Perplexity.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for the embeddings action.",
      {
        model: s.stringEnum("The embedding model identifier.", ["pplx-embed-v1-0.6b", "pplx-embed-v1-4b"]),
        input: stringOrStringArray("One or more input strings to embed.", "One input string to embed.", {
          maxItems: 512,
        }),
        dimensions: s.integer("The target embedding dimension count."),
        encoding_format: s.stringEnum("The output encoding format for embeddings.", ["base64_int8", "base64_binary"]),
      },
      { optional: ["dimensions", "encoding_format"] },
    ),
    outputSchema: s.object(
      "The response payload for the embeddings action.",
      {
        object: s.string("The top-level object type."),
        model: s.string("The embedding model that generated the output."),
        data: s.array(
          "The generated embeddings.",
          s.looseObject("A single embedding item.", {
            object: s.string("The object type for the embedding item."),
            index: s.integer("The zero-based embedding index."),
            embedding: s.anyOf("The embedding payload.", [
              s.array("The numeric embedding vector.", s.number("One embedding vector value.")),
              s.string("The encoded embedding value."),
            ]),
          }),
        ),
        usage: s.object(
          "Usage information for the embeddings request.",
          {
            prompt_tokens: s.integer("The number of prompt tokens consumed."),
            total_tokens: s.integer("The total number of tokens consumed."),
          },
          { optional: ["prompt_tokens", "total_tokens"], additionalProperties: true },
        ),
      },
      { optional: ["object", "model", "usage"], additionalProperties: true },
    ),
  }),
];
