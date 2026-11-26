import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

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
        model: s.nonEmptyString("Model ID from the model list."),
        messages: s.array("Conversation messages in order.", s.looseObject("An OpenAI-format chat message."), {
          minItems: 1,
        }),
        temperature: s.number("Sampling temperature, when supported by the model.", { minimum: 0, maximum: 2 }),
        max_tokens: s.positiveInteger("Maximum output token count, when supported by the model."),
        top_p: s.number("Nucleus sampling probability, when supported by the model.", { minimum: 0, maximum: 1 }),
        tools: s.array("OpenAI-format tool definitions.", s.looseObject("A tool definition.")),
        tool_choice: s.anyOf("Tool selection policy.", [
          s.string("Tool selection mode."),
          s.looseObject("A named tool selection."),
        ]),
        response_format: s.looseObject("Model-supported response format configuration."),
        stop: s.anyOf("Sequences that stop generation.", [
          s.string("A stop sequence."),
          s.array("Stop sequences.", s.string("A stop sequence.")),
        ]),
        seed: s.integer("Sampling seed, when supported by the model."),
        stream: s.literal(false, { description: "Only false or omitted is supported." }),
      },
      { required: ["model", "messages"], additionalProperties: true },
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
