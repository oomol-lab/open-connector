import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "doubao_seedream";
export const defaultSeedreamModel = "doubao-seedream-5-0-260128";

const sizeSchema: JsonSchema = s.oneOf(
  [
    s.stringEnum("A standard output resolution.", ["2K", "3K", "4K"]),
    s.object(
      "Custom output dimensions in pixels; width multiplied by height must be at least 3,686,400.",
      {
        width: s.integer("The output width in pixels.", { minimum: 1 }),
        height: s.integer("The output height in pixels.", { minimum: 1 }),
      },
      { required: ["width", "height"] },
    ),
  ],
  { description: "The standard resolution or custom pixel dimensions for generated images." },
);

export const doubaoSeedreamActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "generate_image",
    operationType: "write",
    description: "Generate or edit one or more images with Doubao Seedream.",
    inputSchema: s.actionInput(
      {
        model: {
          ...s.withDefault(
            s.nonEmptyString("The Doubao Seedream Model ID or Endpoint ID used for image generation."),
            defaultSeedreamModel,
          ),
          examples: [defaultSeedreamModel],
        },
        prompt: s.string("The image generation or editing prompt.", { minLength: 1, maxLength: 1000 }),
        images: s.array(
          "Public image URLs or data URLs used as references for image editing or fusion.",
          s.nonEmptyString("A public image URL or data URL."),
          { maxItems: 10 },
        ),
        size: s.withDefault(sizeSchema, "2K"),
        maxImages: s.withDefault(
          s.integer("The maximum number of images to generate. Use 1 for a single image.", {
            minimum: 1,
            maximum: 15,
          }),
          1,
        ),
        watermark: s.withDefault(s.boolean("Whether generated images include a watermark."), true),
      },
      ["prompt"],
      "A synchronous Doubao Seedream image generation request.",
    ),
    outputSchema: s.actionOutput(
      {
        model: s.nonEmptyString("The model reported by Doubao Seedream."),
        createdAt: s.integer("The response creation Unix timestamp in seconds."),
        images: s.array(
          "The generated images.",
          s.object(
            "A generated image.",
            {
              url: s.nonEmptyString("The temporary generated image URL."),
              size: s.nonEmptyString("The generated image dimensions as WIDTHxHEIGHT."),
            },
            { required: ["url", "size"] },
          ),
        ),
        usage: s.object(
          "Image generation usage reported by Doubao Seedream.",
          {
            generatedImages: s.nonNegativeInteger("The number of generated images."),
            outputTokens: s.nonNegativeInteger("The output token count."),
            totalTokens: s.nonNegativeInteger("The total token count."),
          },
          { required: ["generatedImages", "outputTokens", "totalTokens"] },
        ),
      },
      "The generated Doubao Seedream images and usage.",
    ),
  }),
];
