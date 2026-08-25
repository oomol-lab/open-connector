import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "imgbb";

const hostedVariantSchema = s.object("One hosted image variant returned by ImgBB.", {
  filename: s.string("The file name returned by ImgBB for this image variant."),
  name: s.string("The base image name returned by ImgBB for this image variant."),
  mimeType: s.string("The MIME type returned by ImgBB for this image variant."),
  extension: s.string("The file extension returned by ImgBB for this image variant."),
  url: s.url("The hosted ImgBB URL for this image variant."),
});

const uploadImageInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for uploading one image to ImgBB.",
    {
      imageUrl: s.url("The public image URL to upload to ImgBB."),
      contentBase64: s.nonEmptyString("The Base64-encoded image bytes to upload to ImgBB."),
      name: s.nonEmptyString("The optional file name to associate with the upload."),
      expiration: s.integer("The number of seconds after which ImgBB should automatically delete the upload.", {
        minimum: 60,
        maximum: 15_552_000,
      }),
    },
    { optional: ["imageUrl", "contentBase64", "name", "expiration"] },
  ),
  oneOf: [{ required: ["imageUrl"] }, { required: ["contentBase64"] }],
};

const uploadImageOutputSchema = s.object("The output payload for uploading an image to ImgBB.", {
  upload: s.object(
    "The normalized ImgBB upload record.",
    {
      id: s.string("The ImgBB upload identifier."),
      title: s.string("The upload title returned by ImgBB."),
      viewerUrl: s.url("The ImgBB viewer page URL."),
      imageUrl: s.url("The direct ImgBB image URL."),
      displayUrl: s.url("The display-sized ImgBB image URL."),
      width: s.integer("The uploaded image width in pixels."),
      height: s.integer("The uploaded image height in pixels."),
      sizeBytes: s.integer("The uploaded image size in bytes."),
      uploadedAtUnix: s.integer("The Unix timestamp when ImgBB stored the image."),
      expirationSeconds: s.integer("The automatic deletion period in seconds, or 0 when the upload does not expire."),
      image: {
        ...hostedVariantSchema,
        description: "The original uploaded image variant.",
      },
      thumb: s.nullable({
        ...hostedVariantSchema,
        description: "The thumbnail image variant returned by ImgBB when available.",
      }),
      medium: s.nullable({
        ...hostedVariantSchema,
        description: "The medium-sized image variant returned by ImgBB when available.",
      }),
      deleteUrl: s.url("The ImgBB delete URL for this upload."),
    },
    { optional: ["thumb", "medium"] },
  ),
});

export const imgbbActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_image",
    description: "Upload one image to ImgBB from a public URL or Base64 content and return the hosted image metadata.",
    inputSchema: uploadImageInputSchema,
    outputSchema: uploadImageOutputSchema,
  }),
];
