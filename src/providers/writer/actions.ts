import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "writer";

const noInputSchema = s.object("No input parameters are required for this action.", {});

const writerModelSchema = s.object(
  "A Writer model entry.",
  {
    id: s.string("The Writer model identifier."),
    name: s.string("The display name of the Writer model."),
  },
  { required: ["id", "name"] },
);

const listModelsOutputSchema = s.object(
  "The response payload for listing Writer models.",
  {
    models: s.array("The Writer models available to the API key.", writerModelSchema),
  },
  { required: ["models"] },
);

const chatMessageSchema = s.object(
  "A plain-text chat message sent to Writer.",
  {
    role: s.stringEnum("The role of the chat message author.", ["user", "assistant", "system"]),
    content: s.string("The plain-text content of the message."),
    name: s.string("An optional name for the message sender."),
  },
  { optional: ["name"] },
);

const stopSchema = s.anyOf("One or more stop sequences that end generation.", [
  s.string("A single stop sequence."),
  s.array("A list of stop sequences.", s.string("A stop sequence.")),
]);

const responseFormatSchema = {
  ...s.object(
    "The requested response format for the chat completion.",
    {
      type: s.stringEnum("The response format type.", ["text", "json_schema"]),
      json_schema: s.unknownObject("The JSON Schema object used when type is json_schema."),
    },
    { optional: ["json_schema"] },
  ),
  if: {
    properties: {
      type: { const: "json_schema" },
    },
    required: ["type"],
  },
  then: {
    required: ["json_schema"],
  },
} satisfies JsonSchema;

const chatCompletionInputSchema = s.object(
  "Input parameters for creating a Writer chat completion.",
  {
    model: s.string("The Writer model identifier to use for the chat completion.", {
      minLength: 1,
    }),
    messages: s.array("The ordered plain-text conversation messages.", chatMessageSchema, {
      minItems: 1,
    }),
    max_tokens: s.positiveInteger("The maximum number of tokens to generate."),
    temperature: s.number("The sampling temperature for generation."),
    top_p: s.number("The nucleus sampling threshold."),
    n: s.positiveInteger("The number of completions to generate for the prompt."),
    stop: stopSchema,
    logprobs: s.boolean("Whether to return log probabilities for output tokens."),
    stream: s.literal(false, {
      description: "Whether to stream the response. Connector actions only accept false or an omitted value.",
    }),
    response_format: responseFormatSchema,
  },
  {
    required: ["model", "messages"],
  },
);

const writerChatMessageOutputSchema = s.looseObject("The Writer assistant message.", {
  role: s.string("The role associated with the generated message."),
  content: s.nullable(s.string("The generated text content.")),
  refusal: s.nullable(s.string("The refusal text when content was refused.")),
  tool_calls: s.array(
    "Tool calls returned by Writer when tool calling is used through the API.",
    s.unknownObject("A Writer tool call object."),
  ),
});

const writerChatChoiceSchema = s.looseRequiredObject("A single Writer chat completion choice.", {
  index: s.integer("The index of the completion choice."),
  finish_reason: s.string("The reason why Writer stopped generating this choice."),
  message: writerChatMessageOutputSchema,
});

const usageSchema = s.looseObject("Token usage metadata for the Writer chat completion.", {
  prompt_tokens: s.integer("The number of prompt tokens consumed."),
  completion_tokens: s.integer("The number of completion tokens generated."),
  total_tokens: s.integer("The total number of tokens consumed."),
});

const chatCompletionOutputSchema = s.looseRequiredObject(
  "The response payload for a Writer chat completion.",
  {
    id: s.string("The Writer chat completion identifier."),
    object: s.string("The object type returned by Writer."),
    choices: s.array("The generated completion choices.", writerChatChoiceSchema, { minItems: 1 }),
    created: s.integer("The Unix timestamp when the response was created."),
    model: s.string("The Writer model that generated the response."),
    usage: usageSchema,
    system_fingerprint: s.string("The Writer system fingerprint for the response."),
    service_tier: s.string("The Writer service tier used for the response."),
  },
  { optional: ["usage", "system_fingerprint", "service_tier"] },
);

export const writerActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "Retrieve the Writer models available for text generation, chat completions, and other AI tasks.",
    inputSchema: noInputSchema,
    outputSchema: listModelsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Generate a non-streaming Writer chat completion from plain-text conversation messages.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: chatCompletionOutputSchema,
  }),
];
