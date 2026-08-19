import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "textcortex" as const;

function defineAction(
  input: Omit<Parameters<typeof defineProviderAction>[1], "name"> & { service?: string; name: string },
): ActionDefinition {
  const { service: _service, ...action } = input;
  return defineProviderAction(service, action);
}

const modelSchema = s.object("A TextCortex model returned by the OpenAI-compatible API.", {
  id: s.string("The TextCortex model identifier."),
  object: s.stringEnum("The object type for a model record.", ["model"]),
  created: s.integer("The Unix timestamp for the model release date."),
  ownedBy: s.string("The organization that owns the model."),
  raw: s.looseObject("The raw model object returned by TextCortex."),
});

const rawObjectSchema = s.looseObject("A JSON object passed through to or from TextCortex.");

const chatMessageContentPartSchema = s.looseObject(
  "One OpenAI-compatible message content part such as text or image_url.",
);

const chatMessageSchema = s.object(
  "One OpenAI-compatible chat message sent to TextCortex.",
  {
    role: s.stringEnum("The role of the chat message author.", ["system", "user", "assistant", "tool"]),
    content: s.nullable(
      s.anyOf("The message content as plain text, structured content parts, or null.", [
        s.string("The message content as plain text."),
        s.array("The structured message content parts.", chatMessageContentPartSchema, {
          minItems: 1,
        }),
      ]),
    ),
    name: s.string("The optional participant name for the message.", { minLength: 1 }),
    toolCallId: s.string("The tool call identifier this tool message responds to.", {
      minLength: 1,
    }),
    toolCalls: s.nullable(s.array("The assistant tool calls to include in the message.", rawObjectSchema)),
  },
  { optional: ["content", "name", "toolCallId", "toolCalls"] },
);

const responseMessageSchema = s.looseObject("The chat message object returned by TextCortex.");

const usageSchema = s.looseObject("The token usage object returned by TextCortex.");

const chatChoiceSchema = s.object(
  "One chat completion choice returned by TextCortex.",
  {
    index: s.nullable(s.integer("The choice index returned by TextCortex.")),
    finishReason: s.nullable(s.string("The reason TextCortex stopped generating this choice.")),
    message: responseMessageSchema,
    raw: s.looseObject("The raw choice object returned by TextCortex."),
  },
  { optional: ["index", "finishReason", "message"] },
);

const listModelsAction = defineAction({
  service,
  name: "list_models",
  description: "List TextCortex models available to the API key.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing TextCortex models.", {}),
  outputSchema: s.object("The response returned when listing TextCortex models.", {
    object: s.string("The top-level object type returned by TextCortex."),
    models: s.array("The models returned by TextCortex.", modelSchema),
  }),
});

const retrieveModelAction = defineAction({
  service,
  name: "retrieve_model",
  description: "Retrieve metadata for one TextCortex model by model id.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a TextCortex model.", {
    modelId: s.string("The TextCortex model id to retrieve.", { minLength: 1 }),
  }),
  outputSchema: s.object("The response returned when retrieving a TextCortex model.", {
    model: modelSchema,
  }),
});

const createChatCompletionAction = defineAction({
  service,
  name: "create_chat_completion",
  description: "Create a non-streaming OpenAI-compatible chat completion with TextCortex.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a TextCortex chat completion.",
    {
      model: s.string("The model id returned by list_models.", { minLength: 1 }),
      messages: s.array("The ordered chat messages to send to TextCortex.", chatMessageSchema, {
        minItems: 1,
      }),
      temperature: s.nullable(s.number("The sampling temperature.", { minimum: 0, maximum: 2 })),
      topP: s.nullable(s.number("The nucleus sampling value.", { minimum: 0, maximum: 1 })),
      maxTokens: s.nullable(s.integer("The maximum number of tokens to generate.", { minimum: 1 })),
      maxCompletionTokens: s.nullable(
        s.integer("The maximum number of completion tokens to generate.", { minimum: 1 }),
      ),
      presencePenalty: s.nullable(s.number("The presence penalty to apply.", { minimum: -2, maximum: 2 })),
      frequencyPenalty: s.nullable(s.number("The frequency penalty to apply.", { minimum: -2, maximum: 2 })),
      stop: s.nullable(
        s.anyOf("One or more stop sequences.", [
          s.string("A single stop sequence."),
          s.array("A list of stop sequences.", s.string("One stop sequence."), { minItems: 1 }),
        ]),
      ),
      n: s.nullable(s.integer("The number of chat completion choices to generate.", { minimum: 1 })),
      stream: s.nullable(s.boolean("Whether to request streaming. Connector actions only support false or null.")),
      responseFormat: s.nullable(rawObjectSchema),
      tools: s.nullable(s.array("The OpenAI-compatible tools available to the model.", rawObjectSchema)),
      toolChoice: s.nullable(
        s.anyOf("The OpenAI-compatible tool selection policy.", [
          s.string("A predefined tool choice."),
          rawObjectSchema,
        ]),
      ),
      user: s.nullable(s.string("A stable end-user identifier for abuse monitoring.")),
      extra: s.nullable(
        s.looseObject("Additional OpenAI-compatible TextCortex request fields to merge into the request body."),
      ),
    },
    {
      optional: [
        "temperature",
        "topP",
        "maxTokens",
        "maxCompletionTokens",
        "presencePenalty",
        "frequencyPenalty",
        "stop",
        "n",
        "stream",
        "responseFormat",
        "tools",
        "toolChoice",
        "user",
        "extra",
      ],
    },
  ),
  outputSchema: s.object("The response returned when creating a TextCortex chat completion.", {
    id: s.string("The chat completion id returned by TextCortex."),
    object: s.string("The chat completion object type returned by TextCortex."),
    created: s.integer("The Unix timestamp when the chat completion was created."),
    model: s.string("The model used for the chat completion."),
    choices: s.array("The chat completion choices returned by TextCortex.", chatChoiceSchema),
    usage: s.nullable(usageSchema),
    raw: s.looseObject("The raw chat completion response returned by TextCortex."),
  }),
});

export const textcortexActions: ActionDefinition[] = [
  listModelsAction,
  retrieveModelAction,
  createChatCompletionAction,
];

export const textcortexActionByName: Map<string, ActionDefinition> = new Map(
  textcortexActions.map((action) => [action.name, action] as const),
);
