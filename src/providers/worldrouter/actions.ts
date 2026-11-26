import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const defaultModel = "gpt-6.2-astra";
const service = "worldrouter";

export const worldrouterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description: "List the models available to the connected WorldRouter API key.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object(
      "Available models.",
      {
        data: s.array(
          "Model entries.",
          s.object(
            "An available model.",
            { id: s.nonEmptyString("Model ID.") },
            {
              required: ["id"],
              additionalProperties: true,
            },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "create_chat_completion",
    operationType: "read",
    description: "Generate a billed, non-streaming chat completion on WorldRouter.",
    inputSchema: s.object(
      "OpenAI-compatible chat completion parameters. Supported options depend on the model.",
      {
        model: s.withDefault(s.nonEmptyString("Model ID from the model list."), defaultModel),
        messages: s.array("Conversation messages in order.", s.looseObject("An OpenAI-format chat message."), {
          minItems: 1,
        }),
        stream: s.literal(false, { description: "Only false or omitted is supported." }),
      },
      { required: ["messages"], additionalProperties: true },
    ),
    outputSchema: s.object(
      "An OpenAI-compatible chat completion.",
      {
        id: s.string("Completion identifier."),
        model: s.string("Model that served the request."),
        choices: s.array("Completion choices.", s.looseObject("A choice with a message and finish reason.")),
        usage: s.looseObject("Token usage for the completion."),
      },
      { required: ["id", "choices"], additionalProperties: true },
    ),
  }),
];
