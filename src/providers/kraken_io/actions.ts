import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kraken_io";

const preserveMetaSchema = s.stringEnum("One metadata section to preserve in the optimized image.", [
  "profile",
  "date",
  "copyright",
  "geotag",
  "orientation",
]);

const chromaSubsamplingSchema = s.stringEnum("The JPEG chroma subsampling mode requested for optimization.", [
  "4:2:0",
  "4:2:2",
  "4:4:4",
]);

const resizeCropModeSchema = s.stringEnum("The gravity or direction used when cropping or fitting an image.", [
  "n",
  "t",
  "nw",
  "tl",
  "ne",
  "tr",
  "w",
  "l",
  "c",
  "e",
  "r",
  "se",
  "br",
  "sw",
  "bl",
  "s",
  "b",
]);

const resizeStrategySchema = s.stringEnum("The Kraken.io resize strategy to apply before optimization.", [
  "exact",
  "portrait",
  "landscape",
  "auto",
  "fit",
  "crop",
  "square",
  "fill",
]);

const resizeSchema = s.object(
  "Kraken.io resize settings for a single optimized output.",
  {
    strategy: resizeStrategySchema,
    width: s.positiveInteger("The target width in pixels."),
    height: s.positiveInteger("The target height in pixels."),
    size: s.positiveInteger("The output square size in pixels for the square strategy."),
    x: s.integer("The crop origin x coordinate in pixels.", { minimum: 0 }),
    y: s.integer("The crop origin y coordinate in pixels.", { minimum: 0 }),
    scale: s.positiveInteger("The percentage used to scale the cropped area after applying the crop strategy."),
    cropMode: resizeCropModeSchema,
    background: s.nonEmptyString("The fill background color in HEX, RGB, or RGBA notation."),
    enhance: s.boolean("Whether Kraken.io should enhance small resized images after resizing."),
  },
  {
    optional: ["width", "height", "size", "x", "y", "scale", "cropMode", "background", "enhance"],
  },
);

const convertSchema = s.object(
  "Kraken.io image conversion settings.",
  {
    format: s.stringEnum("The output file format requested from Kraken.io.", ["jpeg", "png", "gif", "webp", "avif"]),
    background: s.nonEmptyString(
      "The background color used when converting to a format that needs flattened transparency.",
    ),
    keepExtension: s.boolean("Whether Kraken.io should keep the original file extension after conversion."),
  },
  { optional: ["background", "keepExtension"] },
);

const optimizeImageInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for optimizing one image with Kraken.io.",
    {
      sourceUrl: s.url("The public URL of the source image to optimize."),
      contentBase64: s.nonEmptyString("The Base64-encoded source image bytes to upload."),
      fileName: s.nonEmptyString("The filename used for direct upload requests."),
      lossy: s.boolean("Whether Kraken.io should use lossy optimization instead of lossless optimization."),
      quality: s.integer("The custom image quality level for JPG, PNG, and GIF output.", { minimum: 1, maximum: 100 }),
      dev: s.boolean("Whether to enable Kraken.io sandbox mode for development testing."),
      autoOrient: s.boolean("Whether Kraken.io should automatically orient the image from EXIF data."),
      preserveMeta: s.array("The metadata sections to preserve in the optimized file.", preserveMetaSchema, {
        minItems: 1,
      }),
      chromaSubsampling: chromaSubsamplingSchema,
      resize: resizeSchema,
      convert: convertSchema,
    },
    {
      optional: [
        "sourceUrl",
        "contentBase64",
        "fileName",
        "lossy",
        "quality",
        "dev",
        "autoOrient",
        "preserveMeta",
        "chromaSubsampling",
        "resize",
        "convert",
      ],
    },
  ),
  oneOf: [{ required: ["sourceUrl"] }, { required: ["contentBase64"] }],
};

const downloadableFileSchema = s.object("A downloadable optimized file stored in local transit storage.", {
  name: s.nonEmptyString("The filename of the optimized file."),
  mimetype: s.nonEmptyString("The MIME type of the optimized file."),
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local transit download URL for the optimized file."),
  sizeBytes: s.integer("The optimized file size in bytes.", { minimum: 0 }),
  mimeType: s.nonEmptyString("The MIME type of the optimized file."),
});

const userStatusOutputSchema = s.object("The normalized Kraken.io account status payload.", {
  active: s.boolean("Whether the Kraken.io account is currently active."),
  planName: s.string("The subscribed Kraken.io plan name."),
  quotaTotal: s.integer("The total monthly quota in bytes."),
  quotaUsed: s.integer("The used monthly quota in bytes."),
  quotaRemaining: s.integer("The remaining monthly quota in bytes."),
});

const optimizeImageOutputSchema = s.object(
  "The output payload for optimizing one image with Kraken.io.",
  {
    fileName: s.string("The optimized filename returned by Kraken.io."),
    originalSize: s.integer("The original file size in bytes."),
    optimizedSize: s.integer("The optimized file size in bytes."),
    savedBytes: s.integer("The number of bytes saved by Kraken.io."),
    originalWidth: s.integer("The original image width in pixels."),
    originalHeight: s.integer("The original image height in pixels."),
    krakedUrl: s.string("The temporary Kraken.io download URL returned by the optimization request."),
    contentType: s.string("The MIME type of the downloaded optimized file."),
    contentLength: s.integer("The downloaded optimized file size in bytes."),
    file: downloadableFileSchema,
  },
  { optional: ["originalWidth", "originalHeight"] },
);

export const krakenIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_status",
    description: "Fetch the current Kraken.io plan status and monthly optimization quota.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving Kraken.io account status.", {}),
    outputSchema: userStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "optimize_image",
    description:
      "Optimize one image with Kraken.io from either a public URL or direct upload, then store the result in local transit storage.",
    requiredScopes: [],
    inputSchema: optimizeImageInputSchema,
    outputSchema: optimizeImageOutputSchema,
  }),
];
