import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { typesafeEvaluationOutputSchema, typesafeQuestionsSchema } from "../typesafe_ai/actions.ts";

const service = "neon_ai_gateway";

const rawObjectSchema = s.looseObject("A JSON object returned by Neon AI Gateway.");
const rawObjectArraySchema = s.array("A list of JSON objects.", rawObjectSchema);
const noInputSchema = s.object("This action requires no additional input parameters.", {});
const modelIdDescription =
  "The Neon AI Gateway model ID, such as `claude-sonnet-4-6`, `gpt-5-mini`, or `gemini-3-flash`. The `databricks-` prefixed form is also accepted. Use `list_models` to see the IDs this branch can call.";
const streamSchema = s.boolean(
  "Whether to request a streaming response. Connector actions only support false or omitted.",
);

const chatCompletionInputSchema = s.object(
  "Input parameters for an OpenAI-compatible chat completion through Neon AI Gateway.",
  {
    model: s.nonEmptyString(
      `${modelIdDescription} Works with every chat model in the catalog except Responses-only models such as \`gpt-5-3-codex\` and \`gpt-5-5-pro\`.`,
    ),
    messages: s.array("An ordered list of OpenAI-format conversation messages.", rawObjectSchema, { minItems: 1 }),
    n: s.positiveInteger("The number of choices to generate."),
    stop: s.anyOf("Stop sequences for generation.", [
      s.nonEmptyString("A single stop sequence."),
      s.array("Multiple stop sequences.", s.nonEmptyString("A stop sequence."), { minItems: 1 }),
    ]),
    user: s.string("The end user's unique identifier."),
    top_p: s.number("Nucleus sampling parameter.", { minimum: 0, maximum: 1 }),
    stream: streamSchema,
    max_tokens: s.positiveInteger("The maximum number of output tokens."),
    max_completion_tokens: s.positiveInteger("New max output token field, taking precedence over max_tokens."),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 2 }),
    presence_penalty: s.number("Presence penalty.", { minimum: -2, maximum: 2 }),
    frequency_penalty: s.number("Frequency penalty.", { minimum: -2, maximum: 2 }),
    seed: s.integer("Seed for best-effort deterministic sampling."),
    tools: rawObjectArraySchema,
    tool_choice: s.anyOf("Tool selection strategy.", [s.stringEnum(["none", "auto", "required"]), rawObjectSchema]),
    response_format: rawObjectSchema,
    reasoning_effort: s.stringEnum(["none", "minimal", "low", "medium", "high"], {
      description: "Reasoning effort for reasoning models.",
    }),
  },
  {
    required: ["model", "messages"],
    optional: [
      "n",
      "stop",
      "user",
      "top_p",
      "stream",
      "max_tokens",
      "max_completion_tokens",
      "temperature",
      "presence_penalty",
      "frequency_penalty",
      "seed",
      "tools",
      "tool_choice",
      "response_format",
      "reasoning_effort",
    ],
    additionalProperties: true,
  },
);

const responseInputSchema = s.object(
  "Input parameters for an OpenAI Responses API request through Neon AI Gateway.",
  {
    model: s.nonEmptyString(
      `${modelIdDescription} Only OpenAI models serve the Responses API; \`gpt-5-3-codex\` and \`gpt-5-5-pro\` require it.`,
    ),
    input: s.anyOf("The prompt text or an ordered list of Responses API input items.", [
      s.nonEmptyString("A plain-text prompt."),
      s.array("Responses API input items.", rawObjectSchema, { minItems: 1 }),
    ]),
    instructions: s.string("System instructions for the model."),
    max_output_tokens: s.positiveInteger("The maximum number of output tokens."),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 2 }),
    top_p: s.number("Nucleus sampling parameter.", { minimum: 0, maximum: 1 }),
    tools: rawObjectArraySchema,
    tool_choice: s.anyOf("Tool selection strategy.", [s.stringEnum(["none", "auto", "required"]), rawObjectSchema]),
    text: s.looseObject("Text output options, such as a JSON schema format."),
    reasoning: s.looseObject('Reasoning options, such as `{ "effort": "low" }`.'),
    stream: streamSchema,
  },
  {
    required: ["model", "input"],
    optional: [
      "instructions",
      "max_output_tokens",
      "temperature",
      "top_p",
      "tools",
      "tool_choice",
      "text",
      "reasoning",
      "stream",
    ],
    additionalProperties: true,
  },
);

const messageInputSchema = s.object(
  "Input parameters for an Anthropic Messages API request through Neon AI Gateway.",
  {
    model: s.nonEmptyString(`${modelIdDescription} Only Anthropic models serve the Messages API.`),
    max_tokens: s.positiveInteger("The maximum number of output tokens."),
    messages: s.array("An ordered list of Anthropic-format messages.", rawObjectSchema, { minItems: 1 }),
    system: s.anyOf("System prompt content.", [
      s.string("System prompt text."),
      s.array("Structured system prompt content blocks.", rawObjectSchema, { minItems: 1 }),
    ]),
    tools: rawObjectArraySchema,
    tool_choice: s.looseObject(
      'Anthropic tool selection strategy object, such as `{ "type": "auto" }` or `{ "type": "tool", "name": "..." }`.',
    ),
    stop_sequences: s.stringArray("Stop sequences for generation."),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 1 }),
    top_k: s.nonNegativeInteger("Top-k sampling parameter."),
    top_p: s.number("Nucleus sampling parameter.", { minimum: 0, maximum: 1 }),
    thinking: s.looseObject("Extended or adaptive thinking options, forwarded to Anthropic unchanged."),
    stream: streamSchema,
    metadata: rawObjectSchema,
  },
  {
    required: ["model", "max_tokens", "messages"],
    optional: [
      "system",
      "tools",
      "tool_choice",
      "stop_sequences",
      "temperature",
      "top_k",
      "top_p",
      "thinking",
      "stream",
      "metadata",
    ],
    additionalProperties: true,
  },
);

const embeddingInputSchema = s.object(
  "Input parameters for creating embeddings through Neon AI Gateway.",
  {
    model: s.nonEmptyString(
      "The Neon AI Gateway embedding model ID: `qwen3-embedding-0-6b`, `bge-large-en`, or `gte-large-en`, all 1024-dimensional. `bge-large-en` reads only the first 512 tokens of each input.",
    ),
    input: s.anyOf("The text to embed.", [
      s.nonEmptyString("A single text input."),
      s.array(
        "Up to 150 text inputs embedded in one request, returned in the same order.",
        s.nonEmptyString("A text input."),
        {
          minItems: 1,
          maxItems: 150,
        },
      ),
    ]),
    dimensions: s.positiveInteger(
      "A shorter vector length. Only `qwen3-embedding-0-6b` honors it; the other models always return 1024 dimensions.",
    ),
    encoding_format: s.stringEnum(["float", "base64"], { description: "The format of the returned embeddings." }),
    user: s.string("The end user's unique identifier."),
  },
  {
    required: ["model", "input"],
    optional: ["dimensions", "encoding_format", "user"],
    additionalProperties: true,
  },
);

const geminiModelSchema = s.string({
  minLength: 1,
  pattern: "^[A-Za-z0-9._-]+$",
  description:
    "The Google model ID placed in the request path, such as `gemini-3-flash` or `gemini-4-argon`. Only Google Gemini models serve this endpoint.",
});

const generateContentInputSchema = s.object(
  "Input parameters for a Gemini generateContent request through Neon AI Gateway.",
  {
    model: geminiModelSchema,
    contents: s.array("The Gemini conversation contents, each with a role and parts.", rawObjectSchema, {
      minItems: 1,
    }),
    systemInstruction: s.looseObject("Gemini system instruction content."),
    generationConfig: s.looseObject(
      "Gemini generation options, such as temperature, maxOutputTokens, or thinkingConfig.thinkingLevel.",
    ),
    tools: rawObjectArraySchema,
    toolConfig: s.looseObject("Gemini tool calling configuration."),
    safetySettings: rawObjectArraySchema,
  },
  {
    required: ["model", "contents"],
    optional: ["systemInstruction", "generationConfig", "tools", "toolConfig", "safetySettings"],
    additionalProperties: true,
  },
);

const decisionStateSchema: JsonSchema = {
  type: ["string", "object", "array"],
  description: "The text or JSON state the questions are about. Reference an image asset by its key in a state field.",
};

const evaluateInputSchema = s.object(
  "Input parameters for a System One decision request through Neon AI Gateway.",
  {
    model: s.stringEnum("The decision model ID.", ["typesafeai-jev-1-14-0", "openjev-qwen35-4b"]),
    state: decisionStateSchema,
    questions: typesafeQuestionsSchema,
    assets: s.record(
      'Images keyed by the reference used in state, each `{ type: "image", format: "png" | "jpeg", data_base64 }` with plain base64 and no data: prefix. Jev 1.14 rejects images smaller than 280 x 280 pixels.',
      rawObjectSchema,
    ),
  },
  { required: ["model", "state", "questions"], optional: ["assets"] },
);

const modelListOutputSchema = s.requiredObject("OpenAI-format list of the models this branch can call.", {
  data: rawObjectArraySchema,
});

export const neonAiGatewayActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_chat_completion",
    operationType: "read",
    description:
      "Create a chat completion through Neon AI Gateway's OpenAI-compatible `/v1/chat/completions` endpoint. One branch credential reaches Anthropic, OpenAI, Google, and open-weight models.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_response",
    operationType: "read",
    description:
      "Create a response through Neon AI Gateway's OpenAI Responses API endpoint (`/openai/v1/responses`). Required for `gpt-5-3-codex` and `gpt-5-5-pro`. Image generation needs streaming, which connector actions do not support, because non-streaming responses are capped at 655,360 bytes.",
    inputSchema: responseInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_message",
    operationType: "read",
    description:
      "Create an Anthropic Messages API message through Neon AI Gateway (`/anthropic/v1/messages`). Use it for prompt caching and extended thinking on Claude models.",
    inputSchema: messageInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_embedding",
    operationType: "read",
    description: "Create embeddings through Neon AI Gateway's OpenAI-compatible `/v1/embeddings` endpoint.",
    inputSchema: embeddingInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "generate_content",
    operationType: "read",
    description:
      "Generate content with a Google Gemini model through Neon AI Gateway's native Gemini endpoint (`/gemini/v1beta/models/{model}:generateContent`). Use it for Gemini-only options such as `thinkingConfig`; the chat completions action also serves Gemini models.",
    inputSchema: generateContentInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "evaluate",
    operationType: "read",
    description:
      "Answer yes/no (noul), choice, and score questions about text, JSON, or images with TypeSafe System One decision models through Neon AI Gateway (`/typesafe/v1/systemone`). Returns probabilities instead of generated text.",
    inputSchema: evaluateInputSchema,
    outputSchema: typesafeEvaluationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description:
      "List the Neon AI Gateway model catalog in an OpenRouter-shaped response. Each entry's `enabled` field says whether this account can call the model now.",
    inputSchema: noInputSchema,
    outputSchema: modelListOutputSchema,
  }),
];
