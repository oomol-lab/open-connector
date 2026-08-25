import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "deutschlandgpt" as const;

const jsonObjectSchema = s.record("A JSON object with arbitrary string keys.", s.unknown("Any JSON-compatible value."));

const toolCallSchema = s.object("A function call requested by an assistant message.", {
  id: s.nonEmptyString("The identifier used by the corresponding tool response."),
  type: s.literal("function", { description: "The tool-call type. Must be function." }),
  function: s.object("The requested function and its serialized arguments.", {
    name: s.nonEmptyString("The function name."),
    arguments: s.string("The function arguments serialized as a JSON string."),
  }),
});

const messageSchema = s.object(
  "A text message in the conversation history.",
  {
    role: s.stringEnum("The role of the message author.", ["system", "user", "assistant", "tool", "developer"]),
    content: s.nullable(s.string("The text content of the message.")),
    name: s.string("An optional participant name."),
    tool_call_id: s.nonEmptyString("The tool call identifier answered by a tool message."),
    tool_calls: s.array("Function calls requested by an assistant message.", toolCallSchema, {
      minItems: 1,
    }),
  },
  { optional: ["content", "name", "tool_call_id", "tool_calls"] },
);

const functionToolSchema = s.object("A function exposed to the model.", {
  type: s.literal("function", { description: "The tool type. Must be function." }),
  function: s.object(
    "The function definition.",
    {
      name: s.nonEmptyString("The function name."),
      description: s.string("A description that helps the model decide when to call the function."),
      parameters: s.describe(jsonObjectSchema, "A JSON Schema describing the function arguments."),
    },
    { optional: ["description", "parameters"] },
  ),
});

const responseFormatSchema = s.looseRequiredObject(
  "The requested output format, including provider-supported structured output fields.",
  {
    type: s.stringEnum("The response format type.", ["text", "json_object", "json_schema"]),
  },
);

const chatInputSchema = s.object(
  "Input for a synchronous OpenAI-compatible chat completion.",
  {
    model: s.nonEmptyString("The model ID returned by list_models."),
    messages: s.array("The ordered text conversation sent to the model.", messageSchema, {
      minItems: 1,
    }),
    max_completion_tokens: s.integer("The maximum number of generated tokens, including reasoning tokens.", {
      minimum: 1,
    }),
    temperature: s.number("The sampling temperature between 0 and 2.", {
      minimum: 0,
      maximum: 2,
    }),
    stream: s.boolean("Whether to stream the response. Connector actions only accept false or an omitted value."),
    tools: s.array("Functions available to the model.", functionToolSchema),
    parallel_tool_calls: s.boolean("Whether the model may call multiple tools in one turn."),
    reasoning_effort: s.stringEnum("The reasoning budget for supported models.", [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]),
    response_format: s.describe(responseFormatSchema, "The requested response format."),
  },
  {
    optional: [
      "max_completion_tokens",
      "temperature",
      "stream",
      "tools",
      "parallel_tool_calls",
      "reasoning_effort",
      "response_format",
    ],
  },
);

const modelSchema = s.looseRequiredObject("A model available to the connected workspace.", {
  id: s.string("The model identifier."),
  object: s.string("The upstream object type."),
  owned_by: s.string("The provider or organization that owns the model."),
});

const modelsOutputSchema = s.looseRequiredObject("The OpenAI-compatible model list.", {
  object: s.string("The top-level object type."),
  data: s.array("Models available to the API key.", modelSchema),
});

const chatOutputSchema = s.looseRequiredObject("The OpenAI-compatible chat completion result.", {
  id: s.string("The unique completion identifier."),
  object: s.string("The upstream object type."),
  created: s.integer("The Unix timestamp when the completion was created."),
  model: s.string("The model that generated the completion."),
  choices: s.array(
    "Generated completion choices.",
    s.looseObject("A generated choice, including its message and finish reason."),
  ),
  usage: s.looseObject("Token usage reported for the request."),
});

const embeddingInputSchema = s.object(
  "Input for creating one or more text embeddings.",
  {
    model: s.nonEmptyString("The embedding model identifier. Omit it to use the workspace default."),
    input: s.anyOf("Text or a list of texts to embed.", [
      s.string("A single text input."),
      s.array("Multiple text inputs.", s.string("A text input."), { minItems: 1 }),
    ]),
    dimensions: s.integer("The requested embedding vector length when supported by the model.", {
      minimum: 1,
    }),
    encoding_format: s.stringEnum("The representation used for embedding vectors.", ["float", "base64"]),
    task_type: s.string("A task-type hint for optimizing Gemini embedding models, such as SEMANTIC_SIMILARITY."),
  },
  { optional: ["model", "dimensions", "encoding_format", "task_type"] },
);

const embeddingOutputSchema = s.looseRequiredObject("The OpenAI-compatible embedding result.", {
  object: s.string("The top-level object type."),
  model: s.string("The embedding model used for the request."),
  data: s.array(
    "Embedding vectors in input order.",
    s.looseRequiredObject("A single embedding result.", {
      object: s.string("The embedding object type."),
      index: s.integer("The zero-based input index."),
      embedding: s.anyOf("The embedding represented as floats or base64 text.", [
        s.array("The embedding vector.", s.number("A vector component.")),
        s.string("The base64-encoded embedding vector."),
      ]),
    }),
  ),
  usage: s.looseObject("Token usage reported for the request."),
});

export const deutschlandgptActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "List text models enabled for the connected DeutschlandGPT workspace.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list available models.", {}),
    outputSchema: modelsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Create a synchronous text chat completion through DeutschlandGPT.",
    requiredScopes: [],
    inputSchema: chatInputSchema,
    outputSchema: chatOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_embeddings",
    description: "Create embedding vectors for one or more text inputs through DeutschlandGPT.",
    requiredScopes: [],
    inputSchema: embeddingInputSchema,
    outputSchema: embeddingOutputSchema,
  }),
];
