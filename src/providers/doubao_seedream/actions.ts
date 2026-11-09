import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "doubao_seedream";
export const defaultSeedreamModel = "doubao-seedream-5-0-flash-260915";
const sizeSchema: JsonSchema = {
  oneOf: [
    s.stringEnum("Output resolution; auto is only available for layer decomposition.", ["1K", "1.5K", "2K", "auto"]),
    s.object(
      "Custom dimensions: 921600 to 4624220 pixels, aspect ratio from 1/16 to 16. Unavailable for layer decomposition.",
      {
        width: s.integer("The output width in pixels.", { minimum: 1 }),
        height: s.integer("The output height in pixels.", { minimum: 1 }),
      },
      { required: ["width", "height"] },
    ),
  ],
  description: "Output size; defaults to 2K for generation and auto for layer decomposition.",
};

export const doubaoSeedreamActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "generate_image",
    operationType: "write",
    description:
      "Generate or edit one image, or split one image into a background and up to 16 transparent layers with Seedream Pro or Flash.",
    inputSchema: s.actionInput(
      {
        model: s.withDefault(
          s.stringEnum("The Seedream model; Flash prioritizes speed, Pro prioritizes quality.", [
            defaultSeedreamModel,
            "doubao-seedream-5-0-pro-260628",
          ]),
          defaultSeedreamModel,
        ),
        prompt: s.string(
          "Generation or editing instructions; optional for automatic layer decomposition. Coordinates and marks can identify editing regions.",
          { minLength: 1, maxLength: 1000 },
        ),
        images: s.array(
          "Public URLs or data URLs for up to ten references; layer decomposition and transparent editing require exactly one image.",
          s.nonEmptyString("A public image URL or data URL."),
          { minItems: 1, maxItems: 10 },
        ),
        size: sizeSchema,
        layerDecomposition: s.boolean(
          "Split one input image into a background and up to 16 layers. The prompt is optional.",
        ),
        background: s.stringEnum("Transparent output requires one reference with an alpha channel and PNG output.", [
          "opaque",
          "transparent",
        ]),
        outputFormat: s.stringEnum(
          "Output format; in layer decomposition this controls the background only, foreground layers are always PNG.",
          ["png", "jpeg"],
        ),
        optimizePromptMode: s.stringEnum("Prompt optimization mode; fast is only supported by Seedream Pro.", [
          "standard",
          "fast",
        ]),
        watermark: s.withDefault(s.boolean("Whether generated images include a watermark."), true),
      },
      [],
      "A synchronous Seedream generation, editing or layer decomposition request.",
    ),
    outputSchema: s.actionOutput(
      {
        model: s.nonEmptyString("The model reported by Seedream."),
        createdAt: s.integer("The response creation Unix timestamp in seconds."),
        images: s.array(
          "Generated images or decomposed layers.",
          s.object(
            "A generated image or layer.",
            {
              url: s.nonEmptyString("The temporary generated image URL."),
              size: s.nonEmptyString("The generated image dimensions as WIDTHxHEIGHT."),
              outputFormat: s.stringEnum("The returned image format.", ["png", "jpeg"]),
              background: s.stringEnum("Whether the image background is transparent.", ["opaque", "transparent"]),
              zIndex: s.integer("Layer stacking order; zero identifies the background.", { minimum: 0, maximum: 16 }),
              boundingBox: s.object(
                "Layer placement on the background canvas.",
                {
                  absolute: s.array(
                    "Absolute bounding box as left, top, right, bottom in pixels.",
                    s.number("A bounding box coordinate."),
                    { minItems: 4, maxItems: 4 },
                  ),
                  normalized: s.array(
                    "Normalized bounding box as left, top, right, bottom on a 0 to 1000 scale.",
                    s.number("A bounding box coordinate."),
                    { minItems: 4, maxItems: 4 },
                  ),
                },
                { required: ["absolute", "normalized"] },
              ),
              name: s.string("The layer name."),
              description: s.string("The layer content description."),
            },
            { required: ["url", "size"] },
          ),
        ),
        usage: s.object(
          "Image usage reported by Seedream; billing applies model and size multipliers.",
          {
            generatedImages: s.nonNegativeInteger(
              "The actual number of output images, including the background and layers.",
            ),
            inputImages: s.nonNegativeInteger("The number of input reference images."),
            outputTokens: s.nonNegativeInteger("The output token count."),
            totalTokens: s.nonNegativeInteger("The total token count."),
          },
          { required: ["generatedImages"] },
        ),
      },
      "Seedream output images, layer metadata and original usage.",
    ),
  }),
];
