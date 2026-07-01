import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

export interface GroqcloudGeneratedActionSchema {
  name: string;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  followUpActions?: string[];
  asyncLifecycle?: ActionDefinition["asyncLifecycle"];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export const groqcloudGeneratedActionSchemas: GroqcloudGeneratedActionSchema[] = [
  {
    name: "list_models",
    description: "List the GroqCloud models available to the current API key.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
      additionalProperties: false,
      description: "No input parameters are required for this action.",
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        object: {
          type: "string",
          description: "The top-level object type.",
        },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The model identifier.",
              },
              object: {
                type: "string",
                description: "The object type returned by the API.",
              },
              created: {
                type: "integer",
                minimum: -9007199254740991,
                maximum: 9007199254740991,
                description: "The Unix timestamp when the model was created.",
              },
              owned_by: {
                type: "string",
                description: "The organization that owns the model.",
              },
              active: {
                type: "boolean",
                description: "Whether the model is currently active.",
              },
              context_window: {
                type: "integer",
                minimum: -9007199254740991,
                maximum: 9007199254740991,
                description: "The model context window size.",
              },
              max_completion_tokens: {
                type: "integer",
                minimum: -9007199254740991,
                maximum: 9007199254740991,
                description: "The maximum completion tokens supported by the model.",
              },
            },
            required: ["id", "object"],
            additionalProperties: {},
            description: "A GroqCloud model record.",
          },
          description: "The list of available GroqCloud models.",
        },
      },
      required: ["object", "data"],
      additionalProperties: {},
      description: "The response payload for listing GroqCloud models.",
    },
  },
  {
    name: "get_model",
    description: "Fetch metadata for one GroqCloud model.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "The exact GroqCloud model identifier to retrieve.",
        },
      },
      required: ["model"],
      additionalProperties: false,
      description: "The input payload for retrieving a GroqCloud model.",
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The model identifier.",
        },
        object: {
          type: "string",
          description: "The object type returned by the API.",
        },
        created: {
          type: "integer",
          minimum: -9007199254740991,
          maximum: 9007199254740991,
          description: "The Unix timestamp when the model was created.",
        },
        owned_by: {
          type: "string",
          description: "The organization that owns the model.",
        },
        active: {
          type: "boolean",
          description: "Whether the model is currently active.",
        },
        context_window: {
          type: "integer",
          minimum: -9007199254740991,
          maximum: 9007199254740991,
          description: "The model context window size.",
        },
        max_completion_tokens: {
          type: "integer",
          minimum: -9007199254740991,
          maximum: 9007199254740991,
          description: "The maximum completion tokens supported by the model.",
        },
      },
      required: ["id", "object"],
      additionalProperties: {},
      description: "A GroqCloud model record.",
    },
  },
  {
    name: "create_chat_completion",
    description: "Create a non-streaming GroqCloud OpenAI-compatible chat completion.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "The GroqCloud model identifier to use.",
        },
        messages: {
          minItems: 1,
          type: "array",
          items: {
            type: "object",
            properties: {
              role: {
                type: "string",
                enum: ["system", "user", "assistant", "tool"],
                description: "The role of the message author.",
              },
              content: {
                anyOf: [
                  {
                    type: "string",
                    description: "Plain text message content.",
                  },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      propertyNames: {
                        type: "string",
                        description: "Object field name.",
                      },
                      additionalProperties: {
                        description: "Any JSON value accepted by the upstream API.",
                      },
                      description: "Any JSON object.",
                    },
                    description: "Structured message content blocks.",
                  },
                  {
                    type: "null",
                    description: "Null content for assistant tool call messages.",
                  },
                ],
                description: "The message content sent to the model.",
              },
              name: {
                type: "string",
                description: "The optional participant name for the message.",
              },
              tool_call_id: {
                type: "string",
                description: "The identifier of the tool call that this tool message responds to.",
              },
              tool_calls: {
                type: "array",
                items: {
                  type: "object",
                  propertyNames: {
                    type: "string",
                    description: "Object field name.",
                  },
                  additionalProperties: {
                    description: "Any JSON value accepted by the upstream API.",
                  },
                  description: "Any JSON object.",
                },
                description: "Tool calls emitted by the assistant.",
              },
            },
            required: ["role"],
            additionalProperties: {},
            description: "A message in the OpenAI-compatible chat completion request.",
          },
          description: "The ordered conversation history sent to the model.",
        },
        frequency_penalty: {
          type: "number",
          minimum: -2,
          maximum: 2,
          description: "The frequency penalty applied to repeated tokens.",
        },
        logit_bias: {
          type: "object",
          propertyNames: {
            type: "string",
            description: "Object field name.",
          },
          additionalProperties: {
            description: "Any JSON value accepted by the upstream API.",
          },
          description: "Token bias adjustments keyed by token id.",
        },
        logprobs: {
          type: "boolean",
          description: "Whether to include token-level log probabilities.",
        },
        max_completion_tokens: {
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
          description: "The maximum number of completion tokens to generate.",
        },
        max_tokens: {
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
          description: "The deprecated maximum token field accepted by OpenAI-compatible clients.",
        },
        n: {
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
          description: "The number of chat completions to generate.",
        },
        parallel_tool_calls: {
          type: "boolean",
          description: "Whether the model may call tools in parallel.",
        },
        presence_penalty: {
          type: "number",
          minimum: -2,
          maximum: 2,
          description: "The presence penalty applied to newly introduced tokens.",
        },
        response_format: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["text", "json_object", "json_schema"],
              description: "The requested response format type.",
            },
            json_schema: {
              type: "object",
              propertyNames: {
                type: "string",
                description: "Object field name.",
              },
              additionalProperties: {
                description: "Any JSON value accepted by the upstream API.",
              },
              description: "The JSON Schema definition when type is json_schema.",
            },
          },
          additionalProperties: {},
          description: "The response format request.",
        },
        seed: {
          type: "integer",
          minimum: -9007199254740991,
          maximum: 9007199254740991,
          description: "A seed for deterministic sampling.",
        },
        stop: {
          anyOf: [
            {
              type: "string",
              description: "A single stop sequence.",
            },
            {
              type: "array",
              items: {
                type: "string",
                description: "A stop sequence.",
              },
              description: "A list of stop sequences.",
            },
          ],
          description: "One or more sequences where generation should stop.",
        },
        stream: {
          type: "boolean",
          description:
            "Whether to request a streaming response. This connector only accepts false or an omitted value.",
        },
        temperature: {
          type: "number",
          minimum: 0,
          maximum: 2,
          description: "The sampling temperature.",
        },
        tool_choice: {
          anyOf: [
            {
              type: "string",
              enum: ["none", "auto", "required"],
              description: "A predefined tool selection mode.",
            },
            {
              type: "object",
              propertyNames: {
                type: "string",
                description: "Object field name.",
              },
              additionalProperties: {
                description: "Any JSON value accepted by the upstream API.",
              },
              description: "A structured tool selection object.",
            },
          ],
          description: "How the model should choose tools.",
        },
        tools: {
          type: "array",
          items: {
            type: "object",
            propertyNames: {
              type: "string",
              description: "Object field name.",
            },
            additionalProperties: {
              description: "Any JSON value accepted by the upstream API.",
            },
            description: "Any JSON object.",
          },
          description: "Tools available to the model.",
        },
        top_logprobs: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991,
          description: "The number of top token log probabilities to include.",
        },
        top_p: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "The nucleus sampling threshold.",
        },
        user: {
          type: "string",
          description: "An end-user identifier for monitoring or abuse detection.",
        },
      },
      required: ["model", "messages"],
      additionalProperties: {},
      description: "The input payload for creating a non-streaming GroqCloud chat completion.",
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The chat completion identifier.",
        },
        object: {
          type: "string",
          description: "The object type returned by the API.",
        },
        created: {
          type: "integer",
          minimum: -9007199254740991,
          maximum: 9007199254740991,
          description: "The Unix timestamp when the completion was created.",
        },
        model: {
          type: "string",
          description: "The model used to generate the completion.",
        },
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: {
                type: "integer",
                minimum: -9007199254740991,
                maximum: 9007199254740991,
                description: "The choice index.",
              },
              message: {
                type: "object",
                properties: {
                  role: {
                    type: "string",
                    enum: ["system", "user", "assistant", "tool"],
                    description: "The role of the message author.",
                  },
                  content: {
                    anyOf: [
                      {
                        type: "string",
                        description: "Plain text message content.",
                      },
                      {
                        type: "array",
                        items: {
                          type: "object",
                          propertyNames: {
                            type: "string",
                            description: "Object field name.",
                          },
                          additionalProperties: {
                            description: "Any JSON value accepted by the upstream API.",
                          },
                          description: "Any JSON object.",
                        },
                        description: "Structured message content blocks.",
                      },
                      {
                        type: "null",
                        description: "Null content for assistant tool call messages.",
                      },
                    ],
                    description: "The message content sent to the model.",
                  },
                  name: {
                    type: "string",
                    description: "The optional participant name for the message.",
                  },
                  tool_call_id: {
                    type: "string",
                    description: "The identifier of the tool call that this tool message responds to.",
                  },
                  tool_calls: {
                    type: "array",
                    items: {
                      type: "object",
                      propertyNames: {
                        type: "string",
                        description: "Object field name.",
                      },
                      additionalProperties: {
                        description: "Any JSON value accepted by the upstream API.",
                      },
                      description: "Any JSON object.",
                    },
                    description: "Tool calls emitted by the assistant.",
                  },
                },
                required: ["role"],
                additionalProperties: {},
                description: "The assistant message returned by the model.",
              },
              finish_reason: {
                anyOf: [
                  {
                    type: "string",
                    description: "The reason generation finished for this choice.",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              logprobs: {
                anyOf: [
                  {
                    type: "object",
                    propertyNames: {
                      type: "string",
                      description: "Object field name.",
                    },
                    additionalProperties: {
                      description: "Any JSON value accepted by the upstream API.",
                    },
                    description: "Token-level log probability details.",
                  },
                  {
                    type: "null",
                  },
                ],
              },
            },
            required: ["index", "message"],
            additionalProperties: {},
            description: "A chat completion choice.",
          },
          description: "The generated completion choices.",
        },
        usage: {
          type: "object",
          properties: {
            prompt_tokens: {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
              description: "The number of prompt tokens consumed.",
            },
            completion_tokens: {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
              description: "The number of completion tokens generated.",
            },
            total_tokens: {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
              description: "The total number of tokens consumed.",
            },
          },
          additionalProperties: {},
          description: "Token usage information.",
        },
        system_fingerprint: {
          type: "string",
          description: "The backend system fingerprint for the completion.",
        },
      },
      required: ["id", "object", "created", "model", "choices"],
      additionalProperties: {},
      description: "The response payload for a GroqCloud chat completion.",
    },
  },
];
