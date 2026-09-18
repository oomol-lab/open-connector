import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "remove_bg";

const base64String = (description: string) => s.string({ minLength: 1, description });

const transitFileSchema = s.object(
  {
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit URL for downloading the generated file."),
    sizeBytes: s.integer("The size of the generated file in bytes."),
    name: s.nonEmptyString("The generated filename."),
    mimeType: s.nonEmptyString("The MIME type of the generated file."),
  },
  { description: "A generated file uploaded to local transit storage." },
);
const accountCreditsSchema = s.object(
  {
    total: s.number("The total credits available to the account."),
    subscription: s.number("The subscription credits available to the account."),
    payg: s.number("The pay-as-you-go credits available to the account."),
    enterprise: s.number("The enterprise credits available to the account."),
  },
  { optional: ["total", "subscription", "payg", "enterprise"], description: "The remove.bg credit balance summary." },
);
const accountApiSchema = s.object(
  {
    freeCalls: s.integer("The number of free API calls still available."),
    sizes: s.string("The available output size tier reported by remove.bg."),
  },
  { optional: ["freeCalls", "sizes"], description: "The remove.bg API usage summary." },
);
const removeBgSourceShape = {
  imageUrl: s.url("A publicly reachable source image URL. Provide exactly one of imageUrl or contentBase64."),
  contentBase64: base64String(
    "Raw Base64-encoded source image bytes. Provide exactly one of imageUrl or contentBase64.",
  ),
};
const removeBgSizeSchema = s.stringEnum(
  "The maximum output resolution. Use preview for cheaper low-resolution output, auto for the best available size, full for up to 25MP, or 50MP for the highest supported size.",
  ["preview", "full", "50MP", "auto", "medium", "hd", "4k", "small", "regular"],
);
const removeBgTypeSchema = s.stringEnum(
  "The foreground type to detect or enforce. Use auto unless the subject category is already known.",
  ["auto", "car", "product", "person", "animal", "graphic", "transportation"],
);
const removeBgTypeLevelSchema = s.stringEnum(
  "How specific remove.bg should be when classifying the detected foreground type. Use latest for the most current classes, or none when classification metadata is not needed.",
  ["none", "1", "2", "latest"],
);
const removeBgFormatSchema = s.stringEnum(
  "The output format. Use auto for the default, png or webp for transparency, jpg when no transparency is needed, or zip for high-resolution transparent workflows.",
  ["auto", "png", "jpg", "zip", "webp"],
);
const removeBgChannelsSchema = s.stringEnum(
  "Whether to return the finalized RGBA image or only the alpha mask. Use rgba for normal background removal results.",
  ["rgba", "alpha"],
);
const removeBackgroundInputSchema = s.object(
  {
    ...removeBgSourceShape,
    size: removeBgSizeSchema,
    type: removeBgTypeSchema,
    typeLevel: removeBgTypeLevelSchema,
    format: removeBgFormatSchema,
    roi: s.nonEmptyString(
      "Region of interest as 'x1 y1 x2 y2' using px or % coordinates. Only content inside this rectangle can be detected as foreground.",
    ),
    crop: s.boolean("Whether to crop away empty transparent regions around the result."),
    cropMargin: s.nonEmptyString(
      "Extra margin to keep around the cropped subject, such as '30px', '10%', or four CSS-like side values. Only applies when crop is true.",
    ),
    scale: s.nonEmptyString(
      "Subject scale relative to the output canvas, such as '75%' or 'original'. Scaling implies centered positioning unless position is also set.",
    ),
    position: s.nonEmptyString(
      "Subject position in the output canvas, such as 'original', 'center', '50% 50%', or another remove.bg-supported position value.",
    ),
    channels: removeBgChannelsSchema,
    shadowType: s.nonEmptyString(
      "A single shadow style for the result. Use auto, car, 3D, drop, or none. Prefer this over the deprecated add_shadow API parameter.",
    ),
    shadowOpacity: s.nonEmptyString(
      "A single shadow opacity for the result. Use auto or a value from 0 to 100 when shadowType is set.",
    ),
    semitransparency: s.boolean(
      "Whether to keep supported semi-transparent regions in the result, currently most useful for car windows.",
    ),
    backgroundColor: s.nonEmptyString(
      "A solid background color to apply, such as a hex color or color name. Do not combine with backgroundImageUrl or backgroundContentBase64.",
    ),
    backgroundImageUrl: s.url(
      "A publicly reachable background image URL to apply. Do not combine with backgroundColor or backgroundContentBase64.",
    ),
    backgroundContentBase64: base64String(
      "Raw Base64-encoded background image bytes to upload as the background image. Do not combine with backgroundColor or backgroundImageUrl.",
    ),
    backgroundFileName: s.nonEmptyString(
      "Optional filename for backgroundContentBase64 uploads. Only set this when backgroundContentBase64 is provided.",
    ),
  },
  {
    optional: [
      "imageUrl",
      "contentBase64",
      "size",
      "type",
      "typeLevel",
      "format",
      "roi",
      "crop",
      "cropMargin",
      "scale",
      "position",
      "channels",
      "shadowType",
      "shadowOpacity",
      "semitransparency",
      "backgroundColor",
      "backgroundImageUrl",
      "backgroundContentBase64",
      "backgroundFileName",
    ],
    description:
      "The input payload for removing an image background with remove.bg. Provide exactly one of imageUrl or contentBase64, and at most one background replacement.",
  },
);
const getAccountOutputSchema = s.object(
  {
    credits: accountCreditsSchema,
    api: accountApiSchema,
  },
  { description: "The output payload for fetching remove.bg account information." },
);
const submitImprovementInputSchema = s.object(
  {
    ...removeBgSourceShape,
    fileName: s.nonEmptyString("Optional source image filename sent to remove.bg for the improvement submission."),
    tag: s.nonEmptyString("Optional grouping tag for related improvement submissions."),
  },
  {
    optional: ["imageUrl", "contentBase64", "fileName", "tag"],
    description:
      "The input payload for submitting an image to the remove.bg improvement program. Provide exactly one of imageUrl or contentBase64.",
  },
);

export const removeBgActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "remove_background",
    operationType: "destructive",
    description:
      "Remove the background from an image with remove.bg and upload the generated image or ZIP result to local transit storage. Provide exactly one of imageUrl or contentBase64; use shadowType and shadowOpacity for shadows.",
    inputSchema: removeBackgroundInputSchema,
    outputSchema: s.object(
      {
        file: transitFileSchema,
        contentType: s.string("The MIME type of the generated result file."),
        contentLength: s.integer("The size of the generated result file in bytes."),
        width: s.integer("The width of the generated result image."),
        height: s.integer("The height of the generated result image."),
        foregroundType: s.string("The detected foreground type returned by remove.bg."),
        creditsCharged: s.number("The credits charged for this request."),
        foregroundTop: s.integer("The top position of the detected foreground."),
        foregroundLeft: s.integer("The left position of the detected foreground."),
        foregroundWidth: s.integer("The width of the detected foreground."),
        foregroundHeight: s.integer("The height of the detected foreground."),
      },
      {
        optional: [
          "width",
          "height",
          "foregroundType",
          "creditsCharged",
          "foregroundTop",
          "foregroundLeft",
          "foregroundWidth",
          "foregroundHeight",
        ],
        description: "The output payload for removing an image background.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description:
      "Fetch the current remove.bg credit balance and free API call allowance for the authenticated account.",
    inputSchema: s.object({}, { description: "The input payload for this action." }),
    outputSchema: getAccountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_improvement",
    operationType: "write",
    description: "Submit a source image to the remove.bg improvement program for future model quality improvements.",
    inputSchema: submitImprovementInputSchema,
    outputSchema: s.object(
      {
        id: s.string("The remove.bg submission identifier."),
      },
      { description: "The output payload for submitting an image improvement sample." },
    ),
  }),
];
