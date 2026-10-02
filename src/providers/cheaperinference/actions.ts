import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cheaperinference";

const rawObjectSchema = s.looseObject("A JSON object returned by Cheaper Inference.");
const rawObjectArraySchema = s.array("A list of JSON objects returned by Cheaper Inference.", rawObjectSchema);
const noInputSchema = s.object("This action requires no additional input parameters.", {});

const chatCompletionInputSchema = s.object(
  "Input parameters when creating a Cheaper Inference chat completion.",
  {
    model: s.nonEmptyString(
      "The model ID to use, such as `gpt-5.4-mini` or `claude-sonnet-5`. Use `list_models` to see the available IDs.",
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
    logit_bias: s.record("Token bias map.", s.number("The bias value for this token.")),
    max_tokens: s.positiveInteger("The maximum number of output tokens."),
    max_completion_tokens: s.positiveInteger(
      "Alternative maximum number of output tokens. When both this and max_tokens are supplied, they must match.",
    ),
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
  "Input parameters when creating a Cheaper Inference Anthropic-format message.",
  {
    model: s.nonEmptyString(
      "The model ID to use, such as `claude-sonnet-5` or `gpt-5.4-mini`. Use `list_models` to see the available IDs.",
    ),
    max_tokens: s.positiveInteger("The maximum number of output tokens."),
    messages: s.array("An ordered list of Anthropic-format messages.", rawObjectSchema, { minItems: 1 }),
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
    tool_choice: s.looseObject(
      'Anthropic tool selection strategy object, such as `{ "type": "auto" }`, `{ "type": "any" }`, `{ "type": "none" }`, or `{ "type": "tool", "name": "..." }`.',
    ),
  },
  {
    required: ["model", "max_tokens", "messages"],
    optional: [
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

const modelListOutputSchema = s.object("Standard Cheaper Inference response that returns a list of models.", {
  data: rawObjectArraySchema,
});

export const cheaperinferenceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_chat_completion",
    operationType: "read",
    description:
      "Create a Cheaper Inference chat completion through the OpenAI-compatible `/chat/completions` endpoint.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_message",
    operationType: "read",
    description: "Create a Cheaper Inference Anthropic-format message through the `/messages` endpoint.",
    inputSchema: messageInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description: "List the models available through Cheaper Inference.",
    inputSchema: noInputSchema,
    outputSchema: modelListOutputSchema,
  }),
];
