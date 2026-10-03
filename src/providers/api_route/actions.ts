import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "api_route";
const messageSchema = s.looseObject(
  "An OpenAI-format message with a role and content, or tool call fields. Image content requires a vision-capable model.",
);
const modelSchema = s.object(
  "A model available to this API key. Additional model metadata varies by model.",
  { id: s.nonEmptyString("The model ID to pass unchanged in inference requests.") },
  { required: ["id"], additionalProperties: true },
);

export const apiRouteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_chat_completion",
    operationType: "read",
    description: "Generate an API Route chat completion. This is a billed, non-streaming inference request.",
    inputSchema: s.object(
      "OpenAI-compatible chat completion parameters. Supported options depend on the selected model.",
      {
        model: s.nonEmptyString("A model ID returned by list_models; do not add a provider prefix."),
        messages: s.array("Conversation messages in order.", messageSchema, { minItems: 1 }),
        max_tokens: s.positiveInteger("Maximum output token count, when supported by the model."),
        max_completion_tokens: s.positiveInteger("Maximum completion token count for models that use this field."),
        temperature: s.number("Sampling temperature, when supported by the model.", { minimum: 0, maximum: 2 }),
        top_p: s.number("Nucleus sampling probability, when supported by the model.", { minimum: 0, maximum: 1 }),
        stream: s.boolean("Only false or omitted is supported by this JSON action."),
        tools: s.array("OpenAI-format tool definitions.", s.looseObject("A tool definition.")),
        tool_choice: s.anyOf("Tool selection policy.", [
          s.string("Tool selection mode."),
          s.looseObject("A named tool selection."),
        ]),
        response_format: s.looseObject("Model-supported response format configuration."),
      },
      {
        required: ["model", "messages"],
        additionalProperties: true,
      },
    ),
    outputSchema: s.object(
      "An OpenAI-compatible chat completion.",
      {
        id: s.string("Completion identifier."),
        object: s.string("Response object type."),
        created: s.integer("Creation time as a Unix timestamp."),
        model: s.string("Model used for generation."),
        choices: s.array("Generated completion choices.", s.looseObject("A choice with a message and finish reason.")),
        usage: s.looseObject("Token usage reported by the model."),
      },
      { required: ["id", "choices"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description: "List model IDs available to the configured API Route key without running inference.",
    inputSchema: s.object("No additional parameters are required.", {}),
    outputSchema: s.object(
      "The authenticated model list.",
      { data: s.array("Available models.", modelSchema) },
      { required: ["data"], additionalProperties: true },
    ),
  }),
];
