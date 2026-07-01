import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "apipie_ai";

const unknownJsonValueSchema = s.unknown("Any JSON value accepted by the upstream API.");
const jsonObjectSchema = s.record("Any JSON object.", unknownJsonValueSchema);
const noInputSchema = s.object("No input parameters are required for this action.", {});

const modelSchema = s.looseObject("An APIpie AI model record.", {
  id: s.string("The model identifier."),
  object: s.string("The object type returned by the API."),
  type: s.string("The model type, such as llm or embedding.", { minLength: 1 }),
  provider: s.string("The upstream provider that serves the model."),
  name: s.string("The display name of the model."),
  description: s.string("A short model description."),
  context_length: s.integer("The maximum context length supported by the model."),
  max_tokens: s.integer("The maximum output tokens supported by the model."),
});

const modelListOutputSchema = s.looseObject("The response payload for listing APIpie AI models.", {
  object: s.string("The top-level object type."),
  data: s.array("The list of available APIpie AI models.", modelSchema),
});

const textContentPartSchema = s.looseRequiredObject("A text content block in a chat message.", {
  type: s.literal("text", { description: "The content block type." }),
  text: s.string("The text content for this block."),
});

const imageContentPartSchema = s.looseRequiredObject(
  "An image URL content block in a chat message.",
  {
    type: s.literal("image_url", { description: "The content block type." }),
    image_url: s.looseRequiredObject(
      "The image URL payload.",
      {
        url: s.url("The image URL or data URL to send to a vision-capable model."),
        detail: s.stringEnum("The image detail level.", ["auto", "low", "high"]),
      },
      { optional: ["detail"] },
    ),
  },
);

const nullSchema: JsonSchema = {
  type: "null",
  description: "Null content for assistant tool call messages.",
};

const chatMessageContentSchema = s.anyOf("The message content sent to the model.", [
  s.string("Plain text message content."),
  s.array(
    "Structured message content blocks.",
    s.anyOf("A structured message content block.", [
      textContentPartSchema,
      imageContentPartSchema,
      jsonObjectSchema,
    ]),
  ),
  nullSchema,
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

const responseFormatSchema = s.looseObject("Response format configuration.", {
  type: s.stringEnum("The requested response format type.", ["text", "json_object", "json_schema"]),
  json_schema: jsonObjectSchema,
});

const toolChoiceSchema = s.anyOf("Tool selection strategy for the request.", [
  s.stringEnum("A predefined tool selection mode.", ["none", "auto", "required"]),
  jsonObjectSchema,
]);

const chatCompletionInputSchema = s.looseRequiredObject(
  "The input payload for creating a non-streaming APIpie AI chat completion.",
  {
    model: s.string("The APIpie AI model identifier to use."),
    messages: s.array("The ordered conversation history sent to the model.", chatMessageSchema, {
      minItems: 1,
    }),
    frequency_penalty: s.number("The frequency penalty applied to repeated tokens.", {
      minimum: -2,
      maximum: 2,
    }),
    logit_bias: jsonObjectSchema,
    max_tokens: s.positiveInteger("The maximum number of tokens to generate."),
    n: s.positiveInteger("The number of chat completions to generate."),
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
    stream: s.boolean("Whether to request a streaming response. This connector only supports false."),
    temperature: s.number("The sampling temperature.", { minimum: 0, maximum: 2 }),
    tool_choice: toolChoiceSchema,
    tools: s.array("Tools available to the model.", jsonObjectSchema),
    top_p: s.number("The nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
    user: s.string("An end-user identifier for monitoring or abuse detection."),
  },
  {
    optional: [
      "frequency_penalty",
      "logit_bias",
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
      "top_p",
      "user",
    ],
  },
);

const usageSchema = s.looseObject("Token usage information.", {
  prompt_tokens: s.integer("The number of prompt tokens consumed."),
  completion_tokens: s.integer("The number of completion tokens generated."),
  total_tokens: s.integer("The total number of tokens consumed."),
});

const chatCompletionChoiceSchema = s.looseObject("A chat completion choice.", {
  index: s.integer("The choice index."),
  message: chatMessageSchema,
  finish_reason: s.nullable(s.string("The reason generation finished for this choice.")),
  logprobs: s.nullable(jsonObjectSchema),
});

const chatCompletionOutputSchema = s.looseObject(
  "The response payload for an APIpie AI chat completion.",
  {
    id: s.string("The chat completion identifier."),
    object: s.string("The object type returned by the API."),
    created: s.integer("The Unix timestamp when the completion was created."),
    model: s.string("The model used to generate the completion."),
    choices: s.array("The generated completion choices.", chatCompletionChoiceSchema),
    usage: usageSchema,
  },
);

const embeddingInputSchema = s.looseRequiredObject(
  "The input payload for creating APIpie AI embeddings.",
  {
    model: s.string("The APIpie AI embedding model identifier to use."),
    input: s.anyOf("The text input to embed.", [
      s.string("A single text input."),
      s.array("Multiple text inputs.", s.string("A text input."), { minItems: 1 }),
    ]),
    encoding_format: s.stringEnum("The format of the returned embedding vectors.", ["float", "np"]),
    dimensions: s.integer("The number of dimensions in the output embedding vector.", {
      minimum: 1,
      maximum: 1536,
    }),
    user: s.string("An end-user identifier for monitoring or abuse detection."),
  },
  { optional: ["encoding_format", "dimensions", "user"] },
);

const embeddingItemSchema = s.looseObject("One embedding result item.", {
  object: s.string("The object type for this embedding item."),
  embedding: s.array("The embedding vector.", s.number("One embedding vector dimension.")),
  index: s.integer("The index of the input item."),
});

const embeddingOutputSchema = s.looseObject("The response payload for APIpie AI embeddings.", {
  object: s.string("The top-level object type."),
  data: s.array("The generated embedding items.", embeddingItemSchema),
  model: s.string("The embedding model used by the API."),
  usage: usageSchema,
});

export const apipieAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "List the APIpie AI models available to the current API key.",
    inputSchema: noInputSchema,
    outputSchema: modelListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_detailed_models",
    description: "List detailed APIpie AI model metadata available to the current API key.",
    inputSchema: noInputSchema,
    outputSchema: modelListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Create a non-streaming APIpie AI OpenAI-compatible chat completion.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: chatCompletionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_embedding",
    description: "Generate APIpie AI embeddings for one or more text inputs.",
    inputSchema: embeddingInputSchema,
    outputSchema: embeddingOutputSchema,
  }),
];

export type ApipieAiActionName = (typeof apipieAiActions)[number]["name"];
