import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "edenai";

const noInputSchema = s.actionInput({}, [], "No input parameters are required for this action.");
const jsonValueSchema = s.unknown("Any JSON value accepted by the upstream API.");
const jsonObjectSchema = s.record("A JSON object with arbitrary upstream fields.", jsonValueSchema);

const edenaiModelSchema = s.looseRequiredObject(
  "An Eden AI model record.",
  {
    id: s.string("The model identifier, formatted as `<vendor>/<model>` (for example `openai/gpt-4o-mini`)."),
    object: s.string("The object type returned by the API."),
    created: s.integer("The Unix timestamp when the model was created."),
    owned_by: s.string("The upstream vendor that owns the model."),
  },
  { optional: ["created", "owned_by"] },
);

const listModelsOutputSchema = s.looseRequiredObject("The response payload for listing Eden AI models.", {
  object: s.string("The top-level object type."),
  data: s.array("The list of available Eden AI models.", edenaiModelSchema),
});

const chatMessageContentSchema = s.anyOf("The message content sent to the model.", [
  s.string("Plain text message content."),
  s.array("Structured message content blocks.", jsonObjectSchema),
  s.nullable(s.string("Null content for assistant tool call messages.")),
]);

const chatMessageSchema = s.looseRequiredObject(
  "A message in the OpenAI-compatible chat completion request.",
  {
    role: s.stringEnum("The role of the message author.", ["system", "user", "assistant", "tool"]),
    content: chatMessageContentSchema,
    name: s.string("The optional participant name for the message."),
    tool_call_id: s.string("The identifier of the tool call that this tool message responds to."),
    tool_calls: s.array("Tool calls emitted by the assistant.", jsonObjectSchema),
  },
  { optional: ["content", "name", "tool_call_id", "tool_calls"] },
);

const responseFormatSchema = s.looseRequiredObject(
  "Response format configuration.",
  {
    type: s.stringEnum("The requested response format type.", ["text", "json_object", "json_schema"]),
    json_schema: jsonObjectSchema,
  },
  { optional: ["json_schema"] },
);

const toolChoiceSchema = s.anyOf("Tool selection strategy for the request.", [
  s.stringEnum("A predefined tool selection mode.", ["none", "auto", "required"]),
  jsonObjectSchema,
]);

const chatCompletionInputSchema: JsonSchema = {
  ...s.looseRequiredObject(
    "The input payload for creating a non-streaming Eden AI chat completion.",
    {
      model: s.string("The Eden AI model identifier, formatted as `<vendor>/<model>`.", { minLength: 1 }),
      messages: s.array("The ordered conversation history sent to the model.", chatMessageSchema, { minItems: 1 }),
      frequency_penalty: s.number("The frequency penalty applied to repeated tokens.", { minimum: -2, maximum: 2 }),
      logit_bias: jsonObjectSchema,
      logprobs: s.boolean("Whether to include token-level log probabilities."),
      max_completion_tokens: s.integer("The maximum number of completion tokens to generate.", { minimum: 1 }),
      max_tokens: s.integer("The deprecated maximum token field accepted by compatible clients.", { minimum: 1 }),
      n: s.integer("The number of chat completions to generate.", { minimum: 1 }),
      presence_penalty: s.number("The presence penalty applied to newly introduced tokens.", {
        minimum: -2,
        maximum: 2,
      }),
      response_format: responseFormatSchema,
      seed: s.integer("A seed for deterministic sampling."),
      stop: s.anyOf("One or more sequences where generation should stop.", [
        s.string("A single stop sequence."),
        s.array("A list of stop sequences.", s.string("A stop sequence.")),
      ]),
      stream: s.boolean(
        "Whether to request a streaming response. This connector only accepts false or an omitted value.",
      ),
      temperature: s.number("The sampling temperature.", { minimum: 0, maximum: 2 }),
      tool_choice: toolChoiceSchema,
      tools: s.array("Tools available to the model.", jsonObjectSchema),
      top_logprobs: s.integer("The number of top token log probabilities to include.", { minimum: 0 }),
      top_p: s.number("The nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
      user: s.string("An end-user identifier for monitoring or abuse detection."),
    },
    {
      optional: [
        "frequency_penalty",
        "logit_bias",
        "logprobs",
        "max_completion_tokens",
        "max_tokens",
        "n",
        "presence_penalty",
        "response_format",
        "seed",
        "stop",
        "stream",
        "temperature",
        "tool_choice",
        "tools",
        "top_logprobs",
        "top_p",
        "user",
      ],
    },
  ),
  not: {
    type: "object",
    properties: {
      stream: { const: true },
    },
    required: ["stream"],
  },
};

const chatCompletionChoiceSchema = s.looseRequiredObject(
  "A chat completion choice.",
  {
    index: s.integer("The choice index."),
    message: chatMessageSchema,
    finish_reason: s.nullableString("The reason generation finished for this choice."),
    logprobs: s.nullable(jsonObjectSchema),
  },
  { optional: ["finish_reason", "logprobs"] },
);

const usageSchema = s.looseObject("Token usage information.", {
  prompt_tokens: s.integer("The number of prompt tokens consumed."),
  completion_tokens: s.integer("The number of completion tokens generated."),
  total_tokens: s.integer("The total number of tokens consumed."),
});

const chatCompletionOutputSchema = s.looseRequiredObject(
  "The response payload for an Eden AI chat completion.",
  {
    id: s.string("The chat completion identifier."),
    object: s.string("The object type returned by the API."),
    created: s.integer("The Unix timestamp when the completion was created."),
    model: s.string("The model used to generate the completion."),
    choices: s.array("The generated completion choices.", chatCompletionChoiceSchema),
    usage: usageSchema,
    cost: s.number("The Eden AI billed cost for the request, when returned."),
  },
  { optional: ["usage", "cost"] },
);

export type EdenAiActionName = "list_models" | "create_chat_completion";

export const edenaiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "List the Eden AI models available to the current API key.",
    inputSchema: noInputSchema,
    outputSchema: listModelsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Create a non-streaming Eden AI OpenAI-compatible chat completion.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: chatCompletionOutputSchema,
  }),
];
