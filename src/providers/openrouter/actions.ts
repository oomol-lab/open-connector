import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "openrouter";

const rawObjectSchema = s.looseObject("A JSON object returned by OpenRouter.");
const rawObjectArraySchema = s.array("A list of JSON objects returned by OpenRouter.", rawObjectSchema);
const noInputSchema = s.object("This action requires no additional input parameters.", {});

const openrouterHeaderInputFields: Record<string, JsonSchema> = {
  httpReferer: s.string(
    "The application URL sent in the HTTP-Referer header for OpenRouter attribution and analytics.",
  ),
  xTitle: s.string("The application display name sent in the X-Title header for OpenRouter console display."),
};
const openrouterHeaderOptionalFields = ["httpReferer", "xTitle"];

const chatCompletionInputSchema = s.object(
  "Input parameters when creating an OpenRouter chat completion.",
  {
    model: s.nonEmptyString("The model ID to use."),
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
    modalities: s.stringArray("List of output modalities to request."),
    models: s.stringArray("Candidate fallback model IDs."),
    metadata: rawObjectSchema,
    provider: rawObjectSchema,
    plugins: rawObjectArraySchema,
    service_tier: s.string("Requested service tier."),
    session_id: s.string("Session ID used to associate requests."),
    parallel_tool_calls: s.boolean("Whether to allow parallel tool calls."),
    stream_options: rawObjectSchema,
    reasoning: rawObjectSchema,
    ...openrouterHeaderInputFields,
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
      "modalities",
      "models",
      "metadata",
      "provider",
      "plugins",
      "service_tier",
      "session_id",
      "parallel_tool_calls",
      "stream_options",
      "reasoning",
      ...openrouterHeaderOptionalFields,
    ],
    additionalProperties: true,
  },
);

const messageInputSchema = s.object(
  "Input parameters when creating an OpenRouter Anthropic Messages request.",
  {
    model: s.nonEmptyString("The model ID to use."),
    max_tokens: s.positiveInteger("The maximum number of output tokens."),
    messages: s.array("An ordered list of Anthropic-format messages.", rawObjectSchema, { minItems: 1 }),
    user: s.string("The end user's unique identifier."),
    tools: rawObjectArraySchema,
    top_k: s.nonNegativeInteger("Top-k sampling parameter."),
    top_p: s.number("Nucleus sampling parameter.", { minimum: 0, maximum: 1 }),
    models: s.stringArray("Candidate fallback model IDs."),
    stream: s.boolean("Whether to request a streaming response. Connector actions only support false or omitted."),
    system: s.anyOf("System prompt content.", [
      s.string("System prompt text."),
      s.array("Structured system prompt content blocks.", rawObjectSchema, { minItems: 1 }),
    ]),
    plugins: rawObjectArraySchema,
    metadata: rawObjectSchema,
    output_config: rawObjectSchema,
    provider: rawObjectSchema,
    service_tier: s.string("Requested service tier."),
    session_id: s.string("Session ID used to associate requests."),
    stop_sequences: s.stringArray("Stop sequences for generation."),
    temperature: s.number("Sampling temperature.", { minimum: 0, maximum: 2 }),
    thinking: rawObjectSchema,
    tool_choice: s.anyOf("Tool selection strategy.", [s.stringEnum(["auto", "any", "none"]), rawObjectSchema]),
    ...openrouterHeaderInputFields,
  },
  {
    required: ["model", "max_tokens", "messages"],
    optional: [
      "user",
      "tools",
      "top_k",
      "top_p",
      "models",
      "stream",
      "system",
      "plugins",
      "metadata",
      "output_config",
      "provider",
      "service_tier",
      "session_id",
      "stop_sequences",
      "temperature",
      "thinking",
      "tool_choice",
      ...openrouterHeaderOptionalFields,
    ],
    additionalProperties: true,
  },
);

const openrouterModelListOutputSchema = s.object("Standard OpenRouter response that returns a list of models.", {
  data: rawObjectArraySchema,
});

export const openrouterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_chat_completion",
    operationType: "read",
    description: "Create an OpenRouter chat completion through the OpenAI-compatible `/chat/completions` endpoint.",
    inputSchema: chatCompletionInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_coinbase_charge",
    operationType: "write",
    description:
      "Call OpenRouter's deprecated Coinbase charge endpoint for credits purchases. The upstream endpoint is currently deprecated and may return 410 Gone.",
    inputSchema: s.object(
      "Input parameters when creating a Coinbase deposit order.",
      {
        amount: s.number("The USD amount to top up.", { exclusiveMinimum: 0 }),
        sender: s.nonEmptyString("The wallet address that initiated the payment."),
        chain_id: s.oneOf(
          [
            s.literal(1, { description: "Ethereum mainnet." }),
            s.literal(137, { description: "Polygon." }),
            s.literal(8453, { description: "Base." }),
          ],
          { description: "The chain ID used to initiate the payment." },
        ),
        ...openrouterHeaderInputFields,
      },
      { required: ["amount", "sender", "chain_id"], optional: openrouterHeaderOptionalFields },
    ),
    outputSchema: s.object("Returns the standard response for Coinbase charge results.", {
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_message",
    operationType: "write",
    description: "Create an OpenRouter Anthropic-format message through the `/messages` endpoint.",
    inputSchema: messageInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_credits",
    operationType: "read",
    description: "Get the authenticated OpenRouter credit balance summary.",
    inputSchema: noInputSchema,
    outputSchema: s.object("Returns the standard response for an OpenRouter credit overview.", {
      data: s.looseObject("Credit overview information.", {
        total_credits: s.number("Cumulative purchased credits."),
        total_usage: s.number("Cumulative credits used."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_current_key",
    operationType: "read",
    description: "Get metadata for the currently authenticated OpenRouter API key.",
    inputSchema: s.object(
      "Input parameters when querying the current API key information.",
      openrouterHeaderInputFields,
      {
        optional: openrouterHeaderOptionalFields,
      },
    ),
    outputSchema: s.object("Returns metadata for the current OpenRouter API key.", {
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_generation",
    operationType: "read",
    description: "Get request and usage metadata for a specific OpenRouter generation.",
    inputSchema: s.object(
      "Input parameters when querying generation metadata.",
      {
        id: s.nonEmptyString("The generation ID to query."),
      },
      { required: ["id"] },
    ),
    outputSchema: s.object("Returns the standard response with generation metadata.", {
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_models_count",
    operationType: "read",
    description: "Get the total number of OpenRouter models, optionally filtered by output modalities.",
    inputSchema: s.object(
      "Input parameters when getting the number of models.",
      {
        outputModalities: s.nonEmptyString(
          "Filter statistics by output modality, such as text, image, audio, embeddings, or all.",
        ),
        ...openrouterHeaderInputFields,
      },
      { optional: ["outputModalities", ...openrouterHeaderOptionalFields] },
    ),
    outputSchema: s.object("Returns the standard response for the number of models.", {
      data: s.object("Model count result.", {
        count: s.integer("The current number of eligible models."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_available_models",
    operationType: "read",
    description: "List the available OpenRouter models, or return the RSS feed when requested.",
    inputSchema: s.object(
      "Input parameters when listing available models for OpenRouter.",
      {
        category: s.nonEmptyString("Filter the model list by use case classification."),
        supportedParameters: s.nonEmptyString(
          "Filter the model list by supported parameter names. Multiple parameters can be separated by commas.",
        ),
        outputModalities: s.nonEmptyString(
          "Filter the list of models by output modality, such as text, image, audio, embeddings, or all.",
        ),
        useRss: s.boolean("Whether to return RSS XML instead of JSON."),
        useRssChatLinks: s.boolean(
          "Whether to use the chat page link instead of the model details page link when returning RSS.",
        ),
      },
      { optional: ["category", "supportedParameters", "outputModalities", "useRss", "useRssChatLinks"] },
    ),
    outputSchema: s.anyOf("Response when listing available OpenRouter models.", [
      openrouterModelListOutputSchema,
      s.object("RSS output format.", {
        rss: s.string("RSS XML string returned when useRss=true."),
      }),
    ]),
  }),
  defineProviderAction(service, {
    name: "list_embedding_models",
    operationType: "read",
    description: "List the embedding models available through OpenRouter.",
    inputSchema: s.object("Input parameters when listing embedding models.", openrouterHeaderInputFields, {
      optional: openrouterHeaderOptionalFields,
    }),
    outputSchema: openrouterModelListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_model_endpoints",
    operationType: "read",
    description: "List the currently available endpoints for a specific OpenRouter model.",
    inputSchema: s.object(
      "Input parameters when listing endpoints for a specific model.",
      {
        author: s.nonEmptyString("Model author or organization name."),
        slug: s.nonEmptyString("Model slug."),
      },
      { required: ["author", "slug"] },
    ),
    outputSchema: s.object("Returns the standard response for the specified model endpoints.", {
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_providers",
    operationType: "read",
    description: "List the model providers currently available through OpenRouter.",
    inputSchema: noInputSchema,
    outputSchema: s.object("Returns a standard response with a list of providers.", {
      data: rawObjectArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_user_models",
    operationType: "read",
    description:
      "List models filtered by the current user's OpenRouter routing preferences, privacy settings, and guardrails.",
    inputSchema: s.object(
      "Input parameters when listing models visible to the current user.",
      openrouterHeaderInputFields,
      {
        optional: openrouterHeaderOptionalFields,
      },
    ),
    outputSchema: openrouterModelListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_zdr_endpoints",
    operationType: "read",
    description: "Preview the OpenRouter endpoints that remain available under Zero Data Retention.",
    inputSchema: s.object("Input parameters when listing ZDR endpoints.", openrouterHeaderInputFields, {
      optional: openrouterHeaderOptionalFields,
    }),
    outputSchema: s.object("Returns the standard response for ZDR endpoints.", {
      data: rawObjectArraySchema,
    }),
  }),
];
