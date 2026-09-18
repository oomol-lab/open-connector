import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tinypng";
const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const downloadableFileSchema = s.object("A downloadable TinyPNG output file.", {
  name: s.string("The filename of the transformed image."),
  mimeType: s.string("The MIME type of the transformed image."),
  downloadUrl: s.string("The transit URL for downloading the transformed image."),
  sizeBytes: s.integer("The transformed image size in bytes."),
});
const tinypngMimeTypeSchema = s.stringEnum("One TinyPNG output MIME type.", [
  "image/avif",
  "image/webp",
  "image/jpeg",
  "image/png",
  "*/*",
]);
const tinypngMetadataSchema = s.stringEnum("The image metadata fields to preserve in the output.", [
  "copyright",
  "creation",
  "location",
]);

const imageInfoSchema = s.object(
  "TinyPNG image metadata.",
  {
    size: s.integer("The image size in bytes."),
    type: s.string("The MIME type of the image."),
    width: s.integer("The image width in pixels."),
    height: s.integer("The image height in pixels."),
  },
  { optional: ["size", "type", "width", "height"] },
);

const resizeSchema = s.object(
  "TinyPNG resize options. Runtime validates width and height requirements for each resize method.",
  {
    method: s.stringEnum("The resize strategy to apply to the image.", ["scale", "fit", "cover", "thumb"]),
    width: s.integer("The target width in pixels.", { minimum: 1 }),
    height: s.integer("The target height in pixels.", { minimum: 1 }),
  },
  { optional: ["width", "height"] },
);

const convertSchema = s.object("TinyPNG conversion options.", {
  type: s.anyOf("One or more preferred output MIME types for conversion.", [
    tinypngMimeTypeSchema,
    s.array("Preferred output MIME types for conversion.", tinypngMimeTypeSchema, {
      minItems: 1,
    }),
  ]),
});

const transformSchema = s.object("TinyPNG transform options.", {
  background: nonEmptyString("The background color used when flattening transparency."),
});

const shrinkImageInputSchema = s.object(
  "The input payload for shrinking an image with TinyPNG. Provide exactly one of sourceUrl or contentBase64.",
  {
    sourceUrl: s.url("The public URL of the source image to compress."),
    contentBase64: nonEmptyString("The Base64-encoded image bytes to compress."),
  },
  { optional: ["sourceUrl", "contentBase64"] },
);

const outputImageInputSchema = s.object(
  "The input payload for retrieving a TinyPNG output image.",
  {
    imageId: nonEmptyString("The TinyPNG image ID returned by `shrink_image`."),
    resize: resizeSchema,
    convert: convertSchema,
    preserve: s.array("Metadata fields to preserve in the output image.", tinypngMetadataSchema, {
      minItems: 1,
    }),
    transform: transformSchema,
  },
  { optional: ["resize", "convert", "preserve", "transform"] },
);

export const tinypngActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "shrink_image",
    operationType: "write",
    description: "Create a TinyPNG compressed image resource from a public URL or base64-encoded image bytes.",
    requiredScopes: [],
    inputSchema: shrinkImageInputSchema,
    outputSchema: s.object(
      "The output payload for shrinking an image.",
      {
        imageId: s.string("The TinyPNG image ID for later output requests."),
        outputUrl: s.url("The TinyPNG output URL for the compressed image."),
        compressionCount: s.integer("The current monthly compression count."),
        input: {
          ...imageInfoSchema,
          description: "Metadata for the original input image.",
        },
        output: {
          ...imageInfoSchema,
          description: "Metadata for the compressed output image.",
        },
      },
      { optional: ["compressionCount", "input", "output"] },
    ),
  }),
  defineProviderAction(service, {
    name: "output_image",
    operationType: "read",
    description: "Transform a TinyPNG output image and return a transit URL for the resulting file.",
    requiredScopes: [],
    inputSchema: outputImageInputSchema,
    outputSchema: s.object(
      "The output payload for retrieving a transformed TinyPNG image.",
      {
        imageId: s.string("The TinyPNG image ID used for this output request."),
        compressionCount: s.integer("The current monthly compression count."),
        contentType: s.string("The MIME type of the generated image."),
        contentLength: s.integer("The size of the generated image in bytes."),
        imageWidth: s.integer("The width of the generated image in pixels."),
        imageHeight: s.integer("The height of the generated image in pixels."),
        image: {
          ...downloadableFileSchema,
          description: "The downloadable transformed image file.",
        },
      },
      {
        optional: ["compressionCount", "contentType", "contentLength", "imageWidth", "imageHeight"],
      },
    ),
  }),
];

export type TinypngActionName = "shrink_image" | "output_image";
