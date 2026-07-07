import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "together_ai";

const noInputSchema = s.object("No input parameters are required for this action.", {});
const jsonValueSchema = s.unknown("Any JSON value accepted by the upstream API.");
const jsonObjectSchema = s.record("A JSON object with arbitrary upstream fields.", jsonValueSchema);

const pricingSchema = s.looseRequiredObject("Together AI model pricing metadata.", {
  base: s.number("The base price component."),
  finetune: s.number("The fine-tuning price component."),
  hourly: s.number("The hourly price component."),
  input: s.number("The input token price component."),
  output: s.number("The output token price component."),
});

const togetherAiModelSchema = s.looseRequiredObject(
  "A Together AI model record.",
  {
    id: s.string("The model identifier."),
    object: s.literal("model", { description: "The object type, which is always model." }),
    created: s.integer("The Unix timestamp when the model was created."),
    type: s.stringEnum("The model capability type.", [
      "chat",
      "language",
      "code",
      "image",
      "embedding",
      "moderation",
      "rerank",
    ]),
    display_name: s.string("The display name for the model."),
    organization: s.string("The organization that published the model."),
    link: s.string("The upstream model information URL."),
    license: s.string("The model license."),
    context_length: s.integer("The model context length."),
    pricing: pricingSchema,
  },
  { optional: ["display_name", "organization", "link", "license", "context_length", "pricing"] },
);

const listModelsOutputSchema = s.array(
  "The list of Together AI models available to the current API key.",
  togetherAiModelSchema,
);

const nullContentSchema: JsonSchema = {
  type: "null",
  description: "Null content for assistant tool call messages.",
};

const chatMessageContentSchema = s.anyOf("The message content sent to the model.", [
  s.string("Plain text message content."),
  s.array("Structured message content blocks.", jsonObjectSchema),
  nullContentSchema,
]);

const chatMessageSchema = s.looseRequiredObject(
  "A message in the Together AI chat completion request.",
  {
    role: s.stringEnum("The role of the message author.", ["system", "user", "assistant", "tool"]),
    content: chatMessageContentSchema,
    name: s.string("The optional participant name for the message."),
    tool_call_id: s.string("The identifier of the tool call that this tool message responds to."),
    tool_calls: s.array("Tool calls emitted by the assistant.", jsonObjectSchema),
  },
  { optional: ["content", "name", "tool_call_id", "tool_calls"] },
);

const functionCallSchema = s.anyOf("How a legacy function call should be selected.", [
  s.stringEnum("A predefined function-call selection mode.", ["none", "auto"]),
  s.object("A specific function-call selection.", {
    name: s.nonEmptyString("The function name to call."),
  }),
]);

const responseFormatSchema = s.looseRequiredObject(
  "Response format configuration.",
  {
    type: s.stringEnum("The requested response format type.", ["text", "json_object", "json_schema"]),
    json_schema: jsonObjectSchema,
  },
  { optional: ["json_schema"] },
);

const toolChoiceSchema = s.anyOf("Tool selection strategy for the request.", [
  s.string("A tool name or predefined tool selection mode."),
  jsonObjectSchema,
]);

const reasoningSchema = s.looseRequiredObject(
  "Reasoning configuration for models that support toggling reasoning.",
  {
    enabled: s.boolean("Whether reasoning should be enabled."),
  },
  { optional: ["enabled"] },
);

const chatCompletionInputSchema = s.looseRequiredObject(
  "The input payload for creating a non-streaming Together AI chat completion.",
  {
    model: s.nonEmptyString("The Together AI model identifier to use."),
    messages: s.array("The ordered conversation history sent to the model.", chatMessageSchema, {
      minItems: 1,
    }),
    max_tokens: s.positiveInteger("The maximum number of tokens to generate."),
    stop: s.array("The stop sequences where generation should stop.", s.string("A stop sequence.")),
    temperature: s.number("The sampling temperature.", { minimum: 0 }),
    top_p: s.number("The nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
    top_k: s.integer("The maximum number of next-token choices to consider.", { minimum: 0 }),
    context_length_exceeded_behavior: s.stringEnum(
      "How the API should behave when max_tokens exceeds the model context length.",
      ["truncate", "error"],
    ),
    repetition_penalty: s.number("The repetition penalty applied to generated text."),
    stream: s.boolean(
      "Whether to request a streaming response. This connector only accepts false or an omitted value.",
    ),
    logprobs: s.integer("The number of top token log probabilities to include.", {
      minimum: 0,
      maximum: 20,
    }),
    echo: s.boolean("Whether the response should include the prompt."),
    n: s.integer("The number of completions to generate for each prompt.", {
      minimum: 1,
      maximum: 128,
    }),
    min_p: s.number("An alternative probability threshold to top_p and top_k.", {
      minimum: 0,
      maximum: 1,
    }),
    presence_penalty: s.number("The presence penalty applied to newly introduced topics.", {
      minimum: -2,
      maximum: 2,
    }),
    frequency_penalty: s.number("The frequency penalty applied to repeated tokens.", {
      minimum: -2,
      maximum: 2,
    }),
    logit_bias: s.record("Token bias adjustments keyed by token id.", s.number("The bias to apply to this token.")),
    seed: s.integer("A seed for reproducible sampling."),
    function_call: functionCallSchema,
    response_format: responseFormatSchema,
    tools: s.array("Tools available to the model.", jsonObjectSchema),
    tool_choice: toolChoiceSchema,
    compliance: s.literal("hipaa", { description: "The compliance mode accepted by the API." }),
    chat_template_kwargs: jsonObjectSchema,
    safety_model: s.string("The moderation model used to validate tokens."),
    reasoning_effort: s.stringEnum("The reasoning effort level to apply.", ["low", "medium", "high"]),
    reasoning: reasoningSchema,
  },
  {
    optional: [
      "max_tokens",
      "stop",
      "temperature",
      "top_p",
      "top_k",
      "context_length_exceeded_behavior",
      "repetition_penalty",
      "stream",
      "logprobs",
      "echo",
      "n",
      "min_p",
      "presence_penalty",
      "frequency_penalty",
      "logit_bias",
      "seed",
      "function_call",
      "response_format",
      "tools",
      "tool_choice",
      "compliance",
      "chat_template_kwargs",
      "safety_model",
      "reasoning_effort",
      "reasoning",
    ],
  },
);

const chatCompletionChoiceSchema = s.looseRequiredObject(
  "A chat completion choice.",
  {
    index: s.integer("The choice index."),
    message: chatMessageSchema,
    finish_reason: s.nullable(s.string("The reason generation finished for this choice.")),
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
  "The response payload for a Together AI chat completion.",
  {
    id: s.string("The chat completion identifier."),
    choices: s.array("The generated completion choices.", chatCompletionChoiceSchema),
    usage: usageSchema,
    created: s.integer("The Unix timestamp when the completion was created."),
    model: s.string("The model used to generate the completion."),
    object: s.string("The object type returned by the API."),
  },
  { optional: ["id", "usage", "created", "object"] },
);

const embeddingInputSchema = s.object("The input payload for creating Together AI embeddings.", {
  model: s.nonEmptyString("The Together AI embedding model identifier to use."),
  input: s.oneOf(
    [
      s.nonEmptyString("A single text input to embed."),
      s.array("Multiple text inputs to embed.", s.nonEmptyString("One text input."), {
        minItems: 1,
      }),
    ],
    { description: "The text input or inputs to embed." },
  ),
});

const embeddingItemSchema = s.object("A Together AI embedding result.", {
  object: s.literal("embedding", { description: "The object type, which is always embedding." }),
  embedding: s.array("The embedding vector.", s.number("One embedding vector value.")),
  index: s.integer("The zero-based index of this embedding result."),
});

const embeddingOutputSchema = s.object("The response payload for Together AI embeddings.", {
  object: s.literal("list", { description: "The object type, which is always list." }),
  model: s.string("The embedding model used to generate the vectors."),
  data: s.array("The generated embedding results.", embeddingItemSchema),
});

export const togetherAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "List the Together AI models available to the current API key.",
    inputSchema: noInputSchema,
    outputSchema: listModelsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Create a non-streaming Together AI chat completion.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: chatCompletionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_embedding",
    description: "Create Together AI embeddings for one or more text inputs.",
    inputSchema: embeddingInputSchema,
    outputSchema: embeddingOutputSchema,
  }),
];

export type TogetherAiActionName = (typeof togetherAiActions)[number]["name"];
