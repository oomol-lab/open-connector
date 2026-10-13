import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "litellm";

const rawObjectSchema = s.looseObject("A JSON object returned by LiteLLM.");
const rawObjectArraySchema = s.array("A list of JSON objects returned by LiteLLM.", rawObjectSchema);
const noInputSchema = s.object("This action requires no additional input parameters.", {});
const modelNameDescription =
  "The LiteLLM model name to call, as configured in the proxy `model_list` (for example `gpt-4.1-mini` or `claude-sonnet-4-6`). Use `list_models` to see the names this key can call.";

const chatCompletionInputSchema = s.object(
  "Input parameters when creating a chat completion through the LiteLLM proxy.",
  {
    model: s.nonEmptyString(modelNameDescription),
    messages: s.array("An ordered list of OpenAI-format conversation messages.", rawObjectSchema, { minItems: 1 }),
    n: s.positiveInteger("The number of choices to generate."),
    stop: s.anyOf("Stop sequences for generation.", [
      s.nonEmptyString("A single stop sequence."),
      s.array("Multiple stop sequences.", s.nonEmptyString("A stop sequence."), { minItems: 1 }),
    ]),
    user: s.string("The end user's unique identifier, recorded in LiteLLM spend logs."),
    top_p: s.number("Nucleus sampling parameter.", { minimum: 0, maximum: 1 }),
    stream: s.boolean("Whether to request a streaming response. Connector actions only support false or omitted."),
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
      description: "Reasoning effort for reasoning models. LiteLLM translates it for each upstream provider.",
    }),
    metadata: s.looseObject("Request metadata, such as tags, that LiteLLM records with the spend log entry."),
    drop_params: s.boolean(
      "Ask LiteLLM to drop OpenAI parameters the routed upstream model does not support instead of failing.",
    ),
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
      "metadata",
      "drop_params",
    ],
    additionalProperties: true,
  },
);

const messageInputSchema = s.object(
  "Input parameters when creating an Anthropic-format message through the LiteLLM proxy.",
  {
    model: s.nonEmptyString(
      `${modelNameDescription} LiteLLM translates the Anthropic request for non-Anthropic models.`,
    ),
    max_tokens: s.positiveInteger("The maximum number of output tokens."),
    messages: s.array("An ordered list of Anthropic-format messages.", rawObjectSchema, { minItems: 1 }),
    system: s.anyOf("System prompt content.", [
      s.string("System prompt text."),
      s.array("Structured system prompt content blocks.", rawObjectSchema, { minItems: 1 }),
    ]),
    tools: rawObjectArraySchema,
    tool_choice: s.looseObject(
      'Anthropic tool selection strategy object, such as `{ "type": "auto" }`, `{ "type": "any" }`, or `{ "type": "tool", "name": "..." }`.',
    ),
    stop_sequences: s.stringArray("Stop sequences for generation."),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 1 }),
    top_k: s.nonNegativeInteger("Top-k sampling parameter."),
    top_p: s.number("Nucleus sampling parameter.", { minimum: 0, maximum: 1 }),
    stream: s.boolean("Whether to request a streaming response. Connector actions only support false or omitted."),
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
      "stream",
      "metadata",
    ],
    additionalProperties: true,
  },
);

const embeddingInputSchema = s.object(
  "Input parameters when creating embeddings through the LiteLLM proxy.",
  {
    model: s.nonEmptyString(
      "The LiteLLM embedding model name, as configured in the proxy `model_list`. Use `get_model_info` to find models whose mode is `embedding`.",
    ),
    input: s.anyOf("The text to embed.", [
      s.nonEmptyString("A single text input."),
      s.array("Several text inputs embedded in one request.", s.nonEmptyString("A text input."), {
        minItems: 1,
      }),
    ]),
    dimensions: s.positiveInteger("The number of dimensions for models that support shortened embeddings."),
    encoding_format: s.stringEnum(["float", "base64"], { description: "The format of the returned embeddings." }),
    user: s.string("The end user's unique identifier, recorded in LiteLLM spend logs."),
  },
  {
    required: ["model", "input"],
    optional: ["dimensions", "encoding_format", "user"],
    additionalProperties: true,
  },
);

const modelListOutputSchema = s.requiredObject("OpenAI-format list of the model names this key can call.", {
  data: rawObjectArraySchema,
});

const modelInfoInputSchema = s.object(
  "Input parameters when reading LiteLLM model metadata.",
  {
    model: s.nonEmptyString("Only return deployments of this LiteLLM model name."),
  },
  { optional: ["model"] },
);

const modelInfoSchema = s.requiredObject("Metadata LiteLLM reports for one model deployment.", {
  modelName: s.string("The LiteLLM model name clients call."),
  modelId: s.nullableString("The deployment ID LiteLLM assigned, when present."),
  provider: s.nullableString("The upstream provider LiteLLM routes this deployment to, such as `openai` or `bedrock`."),
  mode: s.nullableString("The model mode, such as `chat`, `embedding`, or `image_generation`."),
  maxInputTokens: s.nullableInteger("The context window in input tokens, when known."),
  maxOutputTokens: s.nullableInteger("The maximum output tokens, when known."),
  inputCostPerToken: s.nullableNumber("USD cost per input token, when known."),
  outputCostPerToken: s.nullableNumber("USD cost per output token, when known."),
  supportsFunctionCalling: s.nullableBoolean("Whether the model supports tool or function calling."),
  supportsVision: s.nullableBoolean("Whether the model accepts image input."),
  supportsReasoning: s.nullableBoolean("Whether the model supports reasoning controls."),
  supportsResponseSchema: s.nullableBoolean("Whether the model supports JSON schema structured output."),
});

const modelInfoOutputSchema = s.requiredObject("Model deployments the LiteLLM proxy exposes to this key.", {
  models: s.array("Model deployments with their capabilities and pricing.", modelInfoSchema),
});

const keyInfoOutputSchema = s.requiredObject(
  "Budget, limits, and access for the LiteLLM key used by this connection.",
  {
    keyAlias: s.nullableString("The key alias set when the key was created."),
    keyName: s.nullableString("The redacted key name LiteLLM shows in the Admin UI."),
    status: s.nullableString("The key status, such as `active`, `expired`, or `revoked`."),
    spend: s.number("USD spent by the key in the current budget window."),
    maxBudget: s.nullableNumber("The USD budget limit of the key, when one is set."),
    remainingBudget: s.nullableNumber("USD left before the key hits its budget, when a budget is set."),
    budgetDuration: s.nullableString("The budget reset period, such as `30d`."),
    budgetResetAt: s.nullableString("When the current budget window ends and spend resets."),
    models: s.stringArray("The model names this key may call. Empty means every model on the proxy."),
    tpmLimit: s.nullableInteger("The tokens-per-minute limit of the key."),
    rpmLimit: s.nullableInteger("The requests-per-minute limit of the key."),
    teamId: s.nullableString("The team the key belongs to."),
    userId: s.nullableString("The user the key belongs to."),
    expires: s.nullableString("When the key stops authenticating requests."),
    blocked: s.nullableBoolean("Whether the key is blocked."),
  },
);

export const litellmActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_chat_completion",
    operationType: "read",
    description:
      "Create a chat completion through the LiteLLM proxy's OpenAI-compatible `/v1/chat/completions` endpoint. LiteLLM routes the request to whichever upstream provider serves the model, with its load balancing, fallbacks, and budget checks applied.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_message",
    operationType: "read",
    description:
      "Create an Anthropic-format message through the LiteLLM proxy's `/v1/messages` endpoint, for any model the proxy serves.",
    inputSchema: messageInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_embedding",
    operationType: "read",
    description: "Create embeddings through the LiteLLM proxy's OpenAI-compatible `/v1/embeddings` endpoint.",
    inputSchema: embeddingInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description: "List the model names this LiteLLM key can call.",
    inputSchema: noInputSchema,
    outputSchema: modelListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_model_info",
    operationType: "read",
    description:
      "Read the context window, output limit, per-token pricing, and capabilities LiteLLM reports for each model deployment, so an agent can pick a model before calling it.",
    inputSchema: modelInfoInputSchema,
    outputSchema: modelInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_key_info",
    operationType: "read",
    description:
      "Read the spend, remaining budget, rate limits, and allowed models of the LiteLLM virtual key used by this connection. The proxy master key has no stored record, so this action needs a virtual key.",
    inputSchema: noInputSchema,
    outputSchema: keyInfoOutputSchema,
  }),
];
