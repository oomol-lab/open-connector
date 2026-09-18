import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "leonardo_ai";

const loosePayloadSchema = s.looseObject("A Leonardo.Ai API object.");
const generationIdSchema = s.nonEmptyString("The Leonardo.Ai generation job identifier.");

const modelSchema = s.looseObject("A Leonardo.Ai production model and its generation parameter schema.", {
  id: s.nonEmptyString("The stable Leonardo.Ai model identifier when provided."),
  model: s.nonEmptyString("The model slug accepted by the Leonardo.Ai v2 generation API when provided."),
  name: s.nonEmptyString("The human-readable model name when provided."),
  description: s.string("The model description when provided."),
  parameters: s.looseObject("The JSON Schema-like generation parameters accepted by this model when provided."),
});

const generationSchema = s.looseObject("A Leonardo.Ai generation job.", {
  id: generationIdSchema,
  status: s.string("The generation status when provided."),
  prompt: s.string("The generation prompt when provided."),
  createdAt: s.string("The generation creation timestamp when provided."),
  updatedAt: s.string("The generation update timestamp when provided."),
});

const imageSchema = s.object(
  "A normalized Leonardo.Ai generated image summary.",
  {
    id: s.nullableString("A Leonardo.Ai image identifier."),
    url: s.nullableString("The generated image URL."),
    nsfw: s.nullableBoolean("Whether Leonardo.Ai marked the image as not safe for work."),
    public: s.nullableBoolean("Whether the generated image is public."),
    raw: loosePayloadSchema,
  },
  { optional: ["id", "url", "nsfw", "public"] },
);

export const leonardoAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description: "List Leonardo.Ai production API models and their model-specific parameter schemas.",
    inputSchema: s.actionInput({}, [], "Input for listing Leonardo.Ai production models."),
    outputSchema: s.looseRequiredObject(
      "The Leonardo.Ai production model list response.",
      {
        models: s.array("The production API models returned by Leonardo.Ai.", modelSchema),
        raw: loosePayloadSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_generation",
    operationType: "write",
    description: "Create a Leonardo.Ai image, video, audio, or 3D generation job using JSON model parameters.",
    followUpActions: ["leonardo_ai.get_generation"],
    asyncLifecycle: {
      startActionId: "leonardo_ai.create_generation",
      statusActionId: "leonardo_ai.get_generation",
    },
    inputSchema: s.actionInput(
      {
        model: s.nonEmptyString("The Leonardo.Ai production model identifier, such as phoenix-v1.0."),
        parameters: s.looseObject("The model-specific generation parameters accepted by Leonardo.Ai."),
        public: s.boolean("Whether generated assets should appear in the Leonardo.Ai community feed."),
      },
      ["model", "parameters"],
      "Input for creating a Leonardo.Ai generation job.",
    ),
    outputSchema: s.looseRequiredObject(
      "The Leonardo.Ai generation creation response.",
      {
        generationId: generationIdSchema,
        apiCreditCost: s.nullableInteger("The API credit cost reported by Leonardo.Ai."),
        raw: loosePayloadSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_generation",
    operationType: "read",
    description: "Retrieve a Leonardo.Ai generation job status and normalized generated image URLs.",
    asyncLifecycle: {
      startActionId: "leonardo_ai.create_generation",
      statusActionId: "leonardo_ai.get_generation",
    },
    inputSchema: s.actionInput(
      { generationId: generationIdSchema },
      ["generationId"],
      "Input for retrieving a Leonardo.Ai generation job.",
    ),
    outputSchema: s.looseRequiredObject(
      "The Leonardo.Ai generation status response.",
      {
        generation: generationSchema,
        status: s.nullableString("The generation status reported by Leonardo.Ai."),
        images: s.array("The generated images normalized from the Leonardo.Ai response.", imageSchema),
        raw: loosePayloadSchema,
      },
      { optional: [] },
    ),
  }),
];
