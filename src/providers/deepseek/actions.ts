import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "deepseek";

const jsonValue = s.unknown("Any JSON value accepted by the DeepSeek API.");
const jsonObject = s.record(jsonValue, { description: "A JSON object passed through to the DeepSeek API." });
const modelName = s.stringEnum("The DeepSeek model identifier.", ["deepseek-chat", "deepseek-reasoner"]);
const noInput = s.object("No input parameters are required for this action.", {});

const chatMessage = s.looseObject(
  {
    role: s.stringEnum("The role of the message author.", ["system", "user", "assistant", "tool"]),
    content: s.nullableString("The text content of the message."),
    name: s.string("The optional participant name for the message."),
    prefix: s.boolean("Whether the assistant message should be treated as a prefix."),
    tool_call_id: s.string("The identifier of the tool call that this tool message responds to."),
    reasoning_content: s.string("Reasoning content provided for assistant context."),
  },
  { description: "A message in the OpenAI-compatible chat completion request." },
);

const chatTool = s.looseObject(
  {
    type: s.literal("function", { description: "The tool type. Must be function." }),
    function: s.looseObject(
      {
        name: s.string("The function name exposed to the model."),
        description: s.string("A human-readable description of the function."),
        parameters: jsonObject,
        strict: s.boolean("Whether the model must follow the declared parameter schema exactly."),
      },
      { description: "The function definition for an OpenAI-compatible tool." },
    ),
  },
  { description: "An OpenAI-compatible tool definition." },
);

const chatToolChoice = s.anyOf("The tool selection policy for the chat completion request.", [
  s.stringEnum("A predefined tool selection strategy for the request.", ["none", "auto", "required"]),
  s.looseObject(
    {
      type: s.literal("function", { description: "The tool choice type. Must be function." }),
      function: s.object({ name: s.string("The name of the function tool to force.") }),
    },
    { description: "A tool choice that forces one specific function tool." },
  ),
]);

const chatCompletionInput = s.object(
  "The input payload for the OpenAI-compatible chat completion action.",
  {
    model: modelName,
    messages: s.array("The ordered conversation history to send to the model.", chatMessage),
    frequency_penalty: s.number("The frequency penalty to apply to repeated tokens.", { minimum: -2, maximum: 2 }),
    logprobs: s.boolean("Whether to include token-level log probability details in the response."),
    max_tokens: s.integer("The maximum number of tokens to generate.", { minimum: 1 }),
    presence_penalty: s.number("The presence penalty to apply to newly introduced tokens.", {
      minimum: -2,
      maximum: 2,
    }),
    response_format: s.object({
      type: s.stringEnum("The response format type requested from the model.", ["text", "json_object"]),
    }),
    stop: s.anyOf("One or more sequences that stop generation.", [
      s.string("A single stop sequence."),
      s.array("A list of stop sequences.", s.string("A stop sequence.")),
    ]),
    stream: s.boolean("Whether to request a streaming response. This connector only accepts false or omission."),
    stream_options: s.object(
      {
        include_usage: s.boolean("Whether usage information should be included in stream chunks."),
      },
      { optional: ["include_usage"], description: "Streaming options for the request." },
    ),
    temperature: s.number("The sampling temperature to use for generation.", { minimum: 0, maximum: 2 }),
    thinking: s.object({
      type: s.stringEnum("Whether reasoning mode should be enabled for the request.", ["enabled", "disabled"]),
    }),
    tool_choice: chatToolChoice,
    tools: s.array("The tools available to the model.", chatTool),
    top_logprobs: s.integer("The number of top token log probabilities to return.", { minimum: 0, maximum: 20 }),
    top_p: s.number("The nucleus sampling threshold.", { minimum: 0, maximum: 1 }),
  },
  {
    required: ["model", "messages"],
    optional: [
      "frequency_penalty",
      "logprobs",
      "max_tokens",
      "presence_penalty",
      "response_format",
      "stop",
      "stream",
      "stream_options",
      "temperature",
      "thinking",
      "tool_choice",
      "tools",
      "top_logprobs",
      "top_p",
    ],
  },
);

const anthropicContent = s.anyOf("Message content as plain text or structured blocks.", [
  s.string("Plain text content."),
  s.array("Structured content blocks.", jsonObject),
]);

const anthropicMessageInput = s.object(
  "The input payload for the Anthropic-compatible message action.",
  {
    model: modelName,
    max_tokens: s.integer("The maximum number of tokens to generate.", { minimum: 1 }),
    messages: s.array(
      "The ordered conversation history to send to the model.",
      s.object({
        role: s.stringEnum("The role of the message author.", ["user", "assistant"]),
        content: anthropicContent,
      }),
    ),
    stop_sequences: s.array("Sequences that stop generation.", s.string("A stop sequence.")),
    stream: s.boolean("Whether to request a streaming response. This connector only accepts false or omission."),
    system: anthropicContent,
    temperature: s.number("The sampling temperature to use for generation.", { minimum: 0, maximum: 2 }),
    thinking: s.looseObject(
      {
        type: s.string("The thinking mode requested by the Anthropic-compatible API."),
        budget_tokens: s.integer("The maximum number of tokens allocated to thinking."),
      },
      { description: "Thinking configuration for the Anthropic-compatible request." },
    ),
    tool_choice: s.anyOf("How the model should choose tools for the request.", [
      s.stringEnum("A predefined Anthropic-compatible tool choice mode.", ["auto", "any", "none"]),
      jsonObject,
    ]),
    tools: s.array("The tools available to the model.", jsonObject),
    top_p: s.number("The nucleus sampling threshold."),
  },
  {
    required: ["model", "max_tokens", "messages"],
    optional: ["stop_sequences", "stream", "system", "temperature", "thinking", "tool_choice", "tools", "top_p"],
  },
);

const modelOutput = s.looseObject(
  {
    id: s.string("The model identifier."),
    object: s.string("The object type returned by the API."),
    owned_by: s.string("The owner of the model."),
  },
  { description: "A DeepSeek model summary." },
);

const balanceOutput = s.looseObject(
  {
    currency: s.string("The currency code for the balance."),
    total_balance: s.string("The total available balance."),
    granted_balance: s.string("The promotional or granted balance."),
    topped_up_balance: s.string("The manually topped-up balance."),
  },
  { description: "A balance entry returned by the DeepSeek balance API." },
);

export const deepseekActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    description: "List the available DeepSeek models.",
    requiredScopes: [],
    inputSchema: noInput,
    outputSchema: s.object({
      object: s.string("The top-level object type returned by the API."),
      data: s.array("The list of available models.", modelOutput),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user_balance",
    description: "Get the current DeepSeek account balance.",
    requiredScopes: [],
    inputSchema: noInput,
    outputSchema: s.object({
      is_available: s.boolean("Whether the account balance information is currently available."),
      balance_infos: s.array("The list of balances grouped by currency.", balanceOutput),
    }),
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    description: "Create a DeepSeek chat completion via the OpenAI-compatible API.",
    requiredScopes: [],
    inputSchema: chatCompletionInput,
    outputSchema: s.looseObject("The response payload for the chat completion action.") as JsonSchema,
  }),
  defineProviderAction(service, {
    name: "create_anthropic_message",
    description: "Create a DeepSeek message via the Anthropic-compatible API.",
    requiredScopes: [],
    inputSchema: anthropicMessageInput,
    outputSchema: s.looseObject("The response payload for the Anthropic-compatible message action.") as JsonSchema,
  }),
];
