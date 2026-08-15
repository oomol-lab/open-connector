import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "orcarouter";

const rawObjectSchema = s.looseObject("A JSON object returned by OrcaRouter.");
const rawObjectArraySchema = s.array("A list of JSON objects returned by OrcaRouter.", rawObjectSchema);
const noInputSchema = s.object("This action requires no additional input parameters.", {});

const chatCompletionInputSchema = s.object(
  "Input parameters when creating an OrcaRouter chat completion.",
  {
    model: s.nonEmptyString(
      "The namespaced model ID to use, such as `orcarouter/auto` or `openai/gpt-4o-mini`. OrcaRouter routes the request to the matching upstream.",
    ),
    messages: s.array("An ordered list of conversation messages.", rawObjectSchema, { minItems: 1 }),
    n: s.positiveInteger("The number of choices to generate."),
    stop: s.anyOf("Stop sequences for generation.", [
      s.nonEmptyString("A single stop sequence."),
      s.array("Multiple stop sequences.", s.nonEmptyString("A stop sequence."), { minItems: 1 }),
    ]),
    user: s.string("The end user's unique identifier."),
    top_p: s.number("Nucleus sampling parameter.", { minimum: 0, maximum: 1 }),
    stream: s.boolean("Whether to request a streaming response. Connector actions only support false or omitted."),
    functions: rawObjectArraySchema,
    function_call: s.anyOf("Legacy function calling strategy converted to tool_choice at execution time.", [
      s.stringEnum(["none", "auto"]),
      rawObjectSchema,
    ]),
    logit_bias: s.record("Token bias map.", s.number("The bias value for this token.")),
    max_tokens: s.positiveInteger("The maximum number of output tokens."),
    max_completion_tokens: s.positiveInteger("New max output token field, taking precedence over max_tokens."),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 2 }),
    presence_penalty: s.number("Presence penalty.", { minimum: -2, maximum: 2 }),
    frequency_penalty: s.number("Frequency penalty.", { minimum: -2, maximum: 2 }),
    logprobs: s.boolean("Whether to return token-level probabilities."),
    top_logprobs: s.integer("The number of top logprobs to return.", { minimum: 0, maximum: 20 }),
    tools: rawObjectArraySchema,
    tool_choice: s.anyOf("Tool selection strategy.", [s.stringEnum(["none", "auto", "required"]), rawObjectSchema]),
    response_format: rawObjectSchema,
    metadata: rawObjectSchema,
    parallel_tool_calls: s.boolean("Whether to allow parallel tool calls."),
  },
  {
    required: ["model", "messages"],
    optional: [
      "n",
      "stop",
      "user",
      "top_p",
      "stream",
      "functions",
      "function_call",
      "logit_bias",
      "max_tokens",
      "max_completion_tokens",
      "temperature",
      "presence_penalty",
      "frequency_penalty",
      "logprobs",
      "top_logprobs",
      "tools",
      "tool_choice",
      "response_format",
      "metadata",
      "parallel_tool_calls",
    ],
    additionalProperties: true,
  },
);

const messageInputSchema = s.object(
  "Input parameters when creating an OrcaRouter Anthropic-format message.",
  {
    model: s.nonEmptyString(
      "The namespaced model ID to use, such as `orcarouter/auto` or `anthropic/claude-haiku-4.5`. OrcaRouter routes the request to the matching upstream.",
    ),
    max_tokens: s.positiveInteger("The maximum number of output tokens."),
    messages: s.array("An ordered list of Anthropic-format messages.", rawObjectSchema, { minItems: 1 }),
    user: s.string("The end user's unique identifier."),
    tools: rawObjectArraySchema,
    top_k: s.nonNegativeInteger("Top-k sampling parameter."),
    top_p: s.number("Nucleus sampling parameter.", { minimum: 0, maximum: 1 }),
    stream: s.boolean("Whether to request a streaming response. Connector actions only support false or omitted."),
    system: s.anyOf("System prompt content.", [
      s.string("System prompt text."),
      s.array("Structured system prompt content blocks.", rawObjectSchema, { minItems: 1 }),
    ]),
    metadata: rawObjectSchema,
    stop_sequences: s.stringArray("Stop sequences for generation."),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 2 }),
    tool_choice: s.anyOf("Tool selection strategy.", [s.stringEnum(["auto", "any", "none"]), rawObjectSchema]),
  },
  {
    required: ["model", "max_tokens", "messages"],
    optional: [
      "user",
      "tools",
      "top_k",
      "top_p",
      "stream",
      "system",
      "metadata",
      "stop_sequences",
      "temperature",
      "tool_choice",
    ],
    additionalProperties: true,
  },
);

const embeddingInputSchema = s.object(
  "Input parameters when creating an OrcaRouter embedding.",
  {
    model: s.nonEmptyString("The namespaced embedding model ID to use, such as `openai/text-embedding-3-small`."),
    input: s.anyOf("Text to embed.", [
      s.nonEmptyString("A single text string to embed."),
      s.array("A list of text strings to embed.", s.nonEmptyString("A text string to embed."), { minItems: 1 }),
    ]),
    encoding_format: s.stringEnum("The format to return the embeddings in.", ["float", "base64"]),
  },
  {
    required: ["model", "input"],
    optional: ["encoding_format"],
  },
);

const modelListOutputSchema = s.object("Standard OrcaRouter response that returns a list of models.", {
  data: rawObjectArraySchema,
});

export const orcarouterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Create an OrcaRouter chat completion through the OpenAI-compatible `/chat/completions` endpoint.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_message",
    description: "Create an OrcaRouter Anthropic-format message through the `/messages` endpoint.",
    inputSchema: messageInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_models",
    description: "List the models available through OrcaRouter.",
    inputSchema: noInputSchema,
    outputSchema: modelListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_embeddings",
    description: "Create embeddings through the OpenAI-compatible `/embeddings` endpoint.",
    inputSchema: embeddingInputSchema,
    outputSchema: s.object("Standard OrcaRouter response that returns a list of embeddings.", {
      data: rawObjectArraySchema,
    }),
  }),
];
