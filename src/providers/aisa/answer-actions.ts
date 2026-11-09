import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const answerActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "answer_perplexity",
    operationType: "read",
    description:
      "Answer questions with Perplexity web research and source citations. Use sonar for a factual lookup, sonar-pro for multi-part questions, or sonar-reasoning-pro for analysis and comparison.",
    requiredScopes: [],
    inputSchema: s.object(
      "A conversation and search controls for a Perplexity research answer.",
      {
        messages: s.array(
          "The conversation so far, including the question to research.",
          s.object(
            "One conversation message.",
            {
              role: s.stringEnum("The role of the message author.", ["system", "user", "assistant"]),
              content: s.string("The plain-text message content."),
            },
            { optional: [] },
          ),
          { minItems: 1 },
        ),
        model: s.optional(
          s.withDefault(
            s.stringEnum(
              "The research model. Defaults to sonar for a factual lookup; sonar-pro performs multi-pass retrieval and sonar-reasoning-pro adds reasoning.",
              ["sonar", "sonar-pro", "sonar-reasoning-pro"],
            ),
            "sonar",
          ),
        ),
        maxTokens: s.optional(s.integer("The maximum number of tokens to generate in the response.")),
        returnCitations: s.optional(
          s.boolean("Whether to return citations and search results. Defaults to true upstream."),
        ),
        searchContext: s.optional(
          s.stringEnum("How much search context to use. Affects per-request cost and defaults to low upstream.", [
            "low",
            "medium",
            "high",
          ]),
        ),
        searchDomainFilter: s.optional(s.array("Limit web search to these domains.", s.string("A domain to search."))),
        searchRecencyFilter: s.optional(
          s.stringEnum("Filter search results by recency.", ["month", "week", "day", "hour"]),
        ),
        temperature: s.optional(
          s.number("Sampling temperature; lower values produce more focused answers.", {
            minimum: 0,
            maximum: 2,
          }),
        ),
        topP: s.optional(s.number("Nucleus sampling probability mass.", { minimum: 0, maximum: 1 })),
        topK: s.optional(
          s.integer("The number of tokens retained for top-k sampling.", {
            minimum: 0,
            maximum: 2048,
          }),
        ),
        frequencyPenalty: s.optional(
          s.number("Penalize frequent tokens to reduce repetition.", { minimum: 0, maximum: 2 }),
        ),
        presencePenalty: s.optional(
          s.number("Penalize previously used tokens to encourage new topics.", {
            minimum: -2,
            maximum: 2,
          }),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The Perplexity answer, citations, search results, and usage.",
      {
        id: s.string("The completion identifier."),
        model: s.string("The model used to produce the answer."),
        object: s.string("The upstream response object type."),
        created: s.integer("The completion creation time as a Unix timestamp."),
        choices: s.array(
          "Generated answer choices.",
          s.looseObject(
            "One generated answer.",
            {
              index: s.integer("The choice index."),
              finish_reason: s.string("Why answer generation stopped."),
              message: s.looseObject(
                "The answer message.",
                {
                  role: s.string("The response message role."),
                  content: s.string("The answer text, including inline citation references."),
                },
                { required: [] },
              ),
            },
            { required: [] },
          ),
        ),
        citations: s.array("Source URLs referenced in the answer.", s.string("A cited source URL.")),
        search_results: s.array(
          "Search results supporting the answer.",
          s.looseObject(
            "One supporting search result.",
            {
              title: s.string("The source title."),
              url: s.string("The source URL."),
              snippet: s.string("The source excerpt."),
              date: s.string("The source date when available."),
              source: s.string("The source category or provider label."),
            },
            { required: [] },
          ),
        ),
        usage: s.looseObject(
          "Upstream token usage, search context, and any reported cost.",
          {
            prompt_tokens: s.integer("The number of input tokens."),
            completion_tokens: s.integer("The number of generated tokens."),
            total_tokens: s.integer("The total token count."),
            search_context_size: s.string("The search context size used by the model."),
          },
          { required: [] },
        ),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "answer_parallel",
    operationType: "read",
    description:
      "Research a question with Parallel and return a text answer or structured JSON with supporting evidence.",
    requiredScopes: [],
    inputSchema: s.object(
      "The conversation, model, and output format for Parallel research.",
      {
        model: s.stringEnum("The Parallel research model.", ["base", "core", "lite", "speed"]),
        messages: s.array(
          "The conversation to research. For json_object output, explicitly ask for JSON in a message.",
          s.object(
            "One conversation message.",
            {
              role: s.stringEnum("The role of the message author.", ["system", "user", "assistant"]),
              content: s.string("The plain-text message content."),
              name: s.optional(s.nullableString("An optional participant name.")),
            },
            { optional: [] },
          ),
          { minItems: 1 },
        ),
        previousInteractionId: s.optional(s.string("A prior interaction_id to continue.")),
        responseFormat: s.optional(
          s.nullable(
            s.anyOf("The OpenAI-compatible output format, preserving JSON Schema keys.", [
              s.object(
                "Return a plain-text answer.",
                {
                  type: s.literal("text", { description: "The plain-text format identifier." }),
                },
                { optional: [] },
              ),
              s.object(
                "Return a JSON answer matching the supplied schema.",
                {
                  type: s.literal("json_schema", { description: "The JSON Schema format identifier." }),
                  json_schema: s.object(
                    "The named JSON Schema output configuration.",
                    {
                      name: s.string("The output schema name."),
                      description: s.optional(s.string("What the requested output should contain.")),
                      schema: s.optional(s.looseObject("The JSON Schema for the generated answer.")),
                      strict: s.optional(s.nullable(s.boolean("Whether to enforce strict schema adherence."))),
                    },
                    { optional: [] },
                  ),
                },
                { optional: [] },
              ),
              s.object(
                "Return a JSON object; also request JSON in the conversation.",
                {
                  type: s.literal("json_object", { description: "The JSON object format identifier." }),
                },
                { optional: [] },
              ),
            ]),
          ),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The Parallel research answer and supporting evidence.",
      {
        id: s.string("The completion identifier."),
        model: s.string("The model used for the research."),
        object: s.string("The upstream response object type."),
        created: s.integer("The response creation time as a Unix timestamp."),
        interaction_id: s.nullableString("The interaction identifier for follow-ups using your own AIsa connection."),
        choices: s.array(
          "The generated answer choices, including the text or serialized JSON answer.",
          s.looseObject("One answer choice and its upstream completion metadata."),
        ),
        basis: s.array(
          "Evidence supporting the answer fields.",
          s.looseObject(
            "Citations and reasoning supporting one output field.",
            {
              field: s.string("The output field name."),
              reasoning: s.string("The reasoning supporting this field."),
              confidence: s.nullableString("The confidence level, when supplied by the model."),
              citations: s.array("Supporting source citations.", s.looseObject("One source citation.")),
            },
            { required: [] },
          ),
        ),
        usage: s.nullable(s.looseObject("The upstream token usage and completion details.")),
      },
      { required: [] },
    ),
  }),
];

export const answerRoutes: Record<string, AisaActionRoute> = {
  answer_perplexity: {
    method: "POST",
    path: "/apis/v1/perplexity/{model}",
    pathParams: { model: "model" },
    query: {},
    body: {
      model: "model",
      messages: "messages",
      maxTokens: "max_tokens",
      returnCitations: "return_citations",
      searchContext: "search_context",
      searchDomainFilter: "search_domain_filter",
      searchRecencyFilter: "search_recency_filter",
      temperature: "temperature",
      topP: "top_p",
      topK: "top_k",
      frequencyPenalty: "frequency_penalty",
      presencePenalty: "presence_penalty",
    },
    bodyDefaults: { stream: false },
    timeoutMs: 180000,
  },
  answer_parallel: {
    method: "POST",
    path: "/apis/v1/parallel/chat/completions",
    query: {},
    body: {
      model: "model",
      messages: "messages",
      previousInteractionId: "previous_interaction_id",
      responseFormat: "response_format",
    },
    bodyDefaults: { stream: false },
    timeoutMs: 180000,
  },
};
