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

const removalImageSchema = s.oneOf([
  s.requiredObject("An image at a public HTTPS URL.", {
    type: s.literal("URL"),
    url: s.url("Public HTTPS image URL."),
  }),
  s.requiredObject("Inline image bytes.", {
    type: s.literal("BASE64"),
    data: s.nonEmptyString("Base64 image bytes without a data URL prefix."),
  }),
  s.requiredObject("An image in the Leonardo library.", {
    type: s.stringEnum(["UPLOADED", "GENERATED", "VARIATION"]),
    id: s.nonEmptyString("Leonardo image identifier."),
  }),
]);
const removalReferenceSchema = s.array(s.requiredObject("Image reference.", { image: removalImageSchema }), {
  minItems: 1,
  maxItems: 1,
});
const removalParametersSchema = s.object(
  {
    guidances: s.object(
      {
        image_reference: removalReferenceSchema,
        background_image_reference: s.optional(removalReferenceSchema),
      },
      { required: ["image_reference"] },
    ),
    size: s.stringEnum(["auto", "preview", "full", "50MP"], {
      description: "Output resolution tier. PNG is limited to 10 megapixels.",
    }),
    format: s.stringEnum(["png", "jpg", "webp"]),
    type: s.stringEnum(["auto", "person", "product", "car", "animal", "graphic", "transportation", "other"]),
    type_level: s.stringEnum(["none", "1", "2", "latest"]),
    channels: s.stringEnum(["rgba", "alpha"]),
    bg_color: s.nonEmptyString("Replacement background color."),
    crop: s.boolean("Crop to the subject."),
    crop_margin: s.nonEmptyString("Crop margin in pixels or percentages."),
    position: s.nonEmptyString("Subject position, such as center or 50% 50%."),
    roi: s.nonEmptyString("Detection region as x1 y1 x2 y2 in pixels or percentages."),
    scale: s.nonEmptyString("Subject scale: original or 10% through 100%."),
    semitransparency: s.boolean("Preserve partially transparent areas."),
    shadow_type: s.stringEnum(["none", "drop", "3d", "car"]),
    shadow_opacity: s.integer({ minimum: 0, maximum: 100, description: "Shadow opacity percentage." }),
  },
  { required: ["guidances"] },
);

export const leonardoAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "remove_background",
    operationType: "write",
    description:
      "Remove an image background synchronously with Leonardo.Ai. Returns image URLs or Base64 without polling; moderated outputs may be empty. Requires a Leonardo API key.",
    inputSchema: s.actionInput(
      {
        parameters: removalParametersSchema,
        ephemeral: s.boolean({
          description:
            "Avoid saving images to the Leonardo library; result URLs expire after 30 minutes. Defaults to true.",
          default: true,
        }),
        public: s.boolean({
          description: "Publish saved results. Ignored when ephemeral is true. Defaults to false.",
          default: false,
        }),
        base64: s.boolean(
          "Return dataB64 instead of a URL. Large outputs may exceed the upstream inline response limit.",
        ),
      },
      ["parameters"],
    ),
    outputSchema: s.object(
      {
        id: s.nonEmptyString("Synchronous generation identifier."),
        results: s.array(
          s.object(
            {
              url: s.url("Result image URL; expires after 30 minutes for ephemeral results."),
              dataB64: s.nonEmptyString("Base64 output when base64 was requested."),
              contentType: s.nonEmptyString("Image media type."),
              width: s.positiveInteger("Output width in pixels."),
              height: s.positiveInteger("Output height in pixels."),
            },
            { required: ["contentType"], additionalProperties: true },
          ),
        ),
        blockedCount: s.nonNegativeInteger("Number of outputs withheld by moderation."),
        cost: s.requiredObject("Reported generation charge.", {
          amount: s.string("Charge amount."),
          unit: s.stringEnum(["CREDITS", "DOLLARS"]),
        }),
      },
      { required: ["id", "results"], additionalProperties: true },
    ),
  }),

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
