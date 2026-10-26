import type { JsonSchema } from "../../core/types.ts";

import { readSchemaProperties, jsonSchema as s } from "../../core/json-schema.ts";
function caseInsensitiveVideoEnum(description: string, values: readonly string[]) {
  const alternatives = values
    .map((value) =>
      [...value]
        .map((c) => (c.toLowerCase() === c.toUpperCase() ? c : `[${c.toLowerCase()}${c.toUpperCase()}]`))
        .join(""),
    )
    .join("|");
  return s.string(description, { pattern: `^(?:${alternatives})$` });
}

const processId: JsonSchema = s.string("Image processing job UUID.", { format: "uuid" });
export const requestId: JsonSchema = s.string("Video enhancement request UUID.", { format: "uuid" });
export const imageHandle: JsonSchema = s.requiredObject("Image job request.", { processId });
export const videoHandle: JsonSchema = s.requiredObject("Video job request.", { requestId });
export const imageInput: JsonSchema = s.object(
  "Submit an image URL or reuse an existing source image.",
  {
    imageUrl: s.url("Image URL fetched by Topaz. Supports JPEG, PNG and TIFF."),
    sourceId: s.string("Existing Topaz source image ID.", { minLength: 1 }),
    model: s.string(
      "Official model name for this endpoint. Defaults to Standard V2 for precision or Redefine for generative enhancement.",
      { minLength: 1 },
    ),
    outputWidth: s.integer("Output width in pixels; height scales proportionally when omitted.", {
      minimum: 1,
      maximum: 32000,
    }),
    outputHeight: s.integer("Output height in pixels; width scales proportionally when omitted.", {
      minimum: 1,
      maximum: 32000,
    }),
    outputFormat: s.stringEnum("Output image format. Defaults to jpeg.", ["jpeg", "jpg", "png", "tiff", "tif"]),
    cropToFill: s.boolean("Crop to fill the output dimensions instead of letterboxing."),
    webhookUrl: s.url("URL for Topaz to POST job status notifications."),
    modelSettings: s.record(
      "Additional settings supported by the selected model, using official parameter names. Cannot override source or common fields.",
      s.string("Model setting value serialized as text."),
    ),
  },
  {
    optional: [
      "imageUrl",
      "sourceId",
      "model",
      "outputWidth",
      "outputHeight",
      "outputFormat",
      "cropToFill",
      "webhookUrl",
      "modelSettings",
    ],
    oneOf: [{ required: ["imageUrl"] }, { required: ["sourceId"] }],
  },
);
export const imageSubmission: JsonSchema = s.object(
  "Submitted image job.",
  {
    process_id: s.string("Image processing job ID."),
    source_id: s.string("Reusable source image ID."),
    eta: s.integer("Estimated completion time in Unix seconds."),
  },
  {
    additionalProperties: true,
    optional: ["source_id", "eta"],
  },
);
export const estimates: JsonSchema = s.looseObject("Estimated credit cost and processing time.", {
  cost: s.array("Lower and upper credit cost estimates.", s.number("Credit estimate.")),
  time: s.array("Lower and upper duration estimates in seconds.", s.number("Duration estimate.")),
});
const external: JsonSchema = s.object(
  "S3 external storage access. Use a presigned URL or an AWS role with bucket and key.",
  {
    provider: s.stringEnum("External storage provider.", ["s3"]),
    presignedUrl: s.url("Presigned URL for downloading the source or uploading the output."),
    awsCredentials: s.object(
      "AWS STS role configuration.",
      {
        roleArn: s.string("AWS role ARN."),
        externalId: s.string("Secret external ID required when assuming the role."),
        duration: s.integer("Assumed role session lifetime in seconds.", { minimum: 1 }),
      },
      {
        optional: ["duration"],
      },
    ),
    bucketName: s.string("S3 bucket name."),
    key: s.string("S3 object key."),
  },
  {
    optional: ["presignedUrl", "awsCredentials", "bucketName", "key"],
    oneOf: [
      {
        required: ["presignedUrl"],
        not: {
          anyOf: [{ required: ["awsCredentials"] }, { required: ["bucketName"] }, { required: ["key"] }],
        },
      },
      { required: ["awsCredentials", "bucketName", "key"], not: { required: ["presignedUrl"] } },
    ],
  },
);
const destinationExternal: JsonSchema = {
  ...external,
  description: "Output S3 storage, also supporting caller-provided multipart upload URLs.",
  properties: {
    ...readSchemaProperties(external),
    multipart: s.requiredObject("Presigned multipart output upload.", {
      uploadId: s.string("Multipart upload ID."),
      urls: s.array("Presigned upload part URLs.", s.url("Presigned upload URL."), { minItems: 1 }),
    }),
  },
  oneOf: [
    ...(external.oneOf as Record<string, unknown>[]).map((branch) => ({
      allOf: [branch, { not: { required: ["multipart"] } }],
    })),
    {
      required: ["multipart"],
      not: {
        anyOf: [
          { required: ["presignedUrl"] },
          { required: ["awsCredentials"] },
          { required: ["bucketName"] },
          { required: ["key"] },
        ],
      },
    },
  ],
};
const videoFilter: JsonSchema = s.object(
  "Model filter with official model-specific parameters such as fps, slowmo or strength.",
  {
    model: s.string("Official video model code, for example prob-4 or apo-8.", { minLength: 1 }),
    videoType: s.stringEnum("Frame/field type of the video", ["Progressive", "Interlaced", "ProgressiveInterlaced"]),
    auto: s.stringEnum(
      "Parameter mode of the selected model\n- Auto - parameter estimation is used with no customization\n- Relative - uses auto parameters with optional weights added\n- Manual - all parameters are manually set",
      ["Auto", "Manual", "Relative"],
    ),
    fieldOrder: s.stringEnum("Optional specification of field order for interlaced input videos", [
      "TopFirst",
      "BottomFirst",
      "Auto",
    ]),
    focusFixLevel: s.stringEnum("Downscales video input for stronger correction of blurred subjects", [
      "None",
      "Normal",
      "Strong",
    ]),
    compression: s.number("Adjust strength of compression recovery", { minimum: -1, maximum: 1 }),
    details: s.number("Amount of detail reconstruction", { minimum: -1, maximum: 1 }),
    prenoise: s.number("Adds noise to input to reduce over-smoothing", {
      minimum: 0,
      maximum: 0.1,
    }),
    noise: s.number("Amount of noise reduction", { minimum: -1, maximum: 1 }),
    halo: s.number("Amount of halo reduction", { minimum: -1, maximum: 1 }),
    preblur: s.number("Adjust anti-aliasing and deblurring strength", { minimum: -1, maximum: 1 }),
    blur: s.number("Amount of sharpness applied", { minimum: -1, maximum: 1 }),
    grain: s.number("Adds grain after AI model processing", { minimum: 0, maximum: 0.1 }),
    grainSigma: s.number("Grain granularity", { minimum: 0, maximum: 1 }),
    grainSize: s.number("Size of generated grain", { minimum: 0, maximum: 5 }),
    grainType: s.stringEnum("Type of grain", ["silver_rich", "gaussian", "grey"]),
    recoverOriginalDetailValue: s.number("Reintroduce source details into the output video", {
      minimum: 0,
      maximum: 1,
    }),
    transferFunction: s.stringEnum("HDR transfer function. Applies to the Hyperion model (`hyp-1`).", ["pq", "hlg"]),
    adjustExposure: s.number("Exposure adjustment. Applies to the Hyperion model (`hyp-1`).", {
      minimum: 0,
      maximum: 1,
    }),
    boostSaturation: s.number("Saturation boost. Applies to the Hyperion model (`hyp-1`).", {
      minimum: 0,
      maximum: 1,
    }),
    highlightThreshold: s.number(
      "Threshold above which pixels are treated as highlights. Applies to the Hyperion model (`hyp-1`).",
      { minimum: 0.45, maximum: 0.85 },
    ),
    rollingShutterCorrection: s.boolean(
      "Correct rolling shutter distortion.\n\n__Required when the stabilization model (`stab-1`) is used.__ Omitting it returns a 400.",
    ),
    strength: s.number("Stabilization strength. Applies to the stabilization model (`stab-1`).", {
      minimum: 0,
      maximum: 16,
    }),
    reduceMotionJitter: s.integer("Amount of motion jitter reduction. Applies to the stabilization model (`stab-1`).", {
      minimum: 0,
      maximum: 5,
    }),
    fullFrame: s.boolean(
      "Preserve the full frame rather than cropping to hide stabilization borders. Applies to the stabilization model (`stab-1`).",
    ),
    slowmo: s.integer(
      "Slow motion factor applied to input video. For example, a value of 2 makes the output twice as slow and doubles the duration.",
      { minimum: 1, maximum: 16 },
    ),
    fps: s.number("Output frame rate, does not increase duration", { minimum: 15, maximum: 240 }),
    duplicate: s.boolean("Analyze input for duplicate frames and remove them"),
    duplicateThreshold: s.number("Sensitivity of detection for duplicate frames", {
      minimum: 0.001,
      maximum: 0.1,
    }),
  },
  {
    additionalProperties: true,
    optional: [
      "videoType",
      "auto",
      "fieldOrder",
      "focusFixLevel",
      "compression",
      "details",
      "prenoise",
      "noise",
      "halo",
      "preblur",
      "blur",
      "grain",
      "grainSigma",
      "grainSize",
      "grainType",
      "recoverOriginalDetailValue",
      "transferFunction",
      "adjustExposure",
      "boostSaturation",
      "highlightThreshold",
      "rollingShutterCorrection",
      "strength",
      "reduceMotionJitter",
      "fullFrame",
      "slowmo",
      "fps",
      "duplicate",
      "duplicateThreshold",
    ],
    allOf: [
      {
        if: { required: ["model"], properties: { model: { const: "stab-1" } } },
        then: { required: ["rollingShutterCorrection"] },
      },
    ],
  },
);
export const videoInput: JsonSchema = s.object(
  "Submit a video using Topaz Express and external S3 storage; processing starts immediately and reserves credits.",
  {
    source: s.object(
      "Source video and external storage.",
      {
        container: caseInsensitiveVideoEnum("Source video container. Case-insensitive.", [
          "3gp",
          "avi",
          "dv",
          "flv",
          "m1v",
          "m2t",
          "m2ts",
          "m2v",
          "m4v",
          "mkv",
          "mov",
          "mp4",
          "mpeg",
          "mpg",
          "mts",
          "mxf",
          "ser",
          "ts",
          "vob",
          "webm",
          "wmv",
        ]),
        md5Hash: s.string("Optional source video MD5 hash."),
        external,
      },
      {
        optional: ["md5Hash"],
      },
    ),
    filters: s.array("Ordered enhancement and frame interpolation filters.", videoFilter, {
      minItems: 1,
    }),
    output: s.object(
      "Output encoding settings. Express defaults to H265/Main10, mp4, no audio and High compression.",
      {
        resolution: s.requiredObject("Output resolution.", {
          width: s.integer("Width in pixels.", { minimum: 1 }),
          height: s.integer("Height in pixels.", { minimum: 1 }),
        }),
        frameRate: s.number("Output frame rate; required for interpolation filters without fps.", {
          exclusiveMinimum: 0,
        }),
        audioBitrate: s.string("Audio bitrate."),
        audioCodec: s.stringEnum("Audio codec; required when copying or converting audio.", ["AAC", "AC3", "PCM"]),
        audioTransfer: s.stringEnum("Audio handling. Defaults to None.", ["Copy", "Convert", "None"]),
        videoEncoder: caseInsensitiveVideoEnum("Video encoder. Case-insensitive; defaults to H265.", [
          "AV1",
          "H264",
          "H265",
          "ProRes",
          "VP9",
        ]),
        videoBitrate: s.string("Constant bitrate with k or m suffix. Required for VP9."),
        dynamicCompressionLevel: s.stringEnum(
          "Automatic compression level. When also supplied, it takes precedence over videoBitrate.",
          ["Low", "Mid", "High"],
        ),
        videoProfile: s.string("Codec profile supported by the selected encoder."),
        cropToFit: s.boolean("Center crop to fit the output dimensions."),
        container: s.stringEnum("Output video container.", ["mp4", "mov", "mkv", "avi", "webm"]),
      },
      {
        optional: [
          "frameRate",
          "audioBitrate",
          "audioCodec",
          "audioTransfer",
          "videoEncoder",
          "videoBitrate",
          "dynamicCompressionLevel",
          "videoProfile",
          "cropToFit",
          "container",
        ],
        allOf: [
          {
            if: {
              required: ["audioTransfer"],
              properties: { audioTransfer: { enum: ["Copy", "Convert"] } },
            },
            then: { required: ["audioCodec"] },
          },
          {
            if: {
              required: ["videoEncoder"],
              properties: { videoEncoder: { type: "string", pattern: "^[vV][pP]9$" } },
            },
            then: { required: ["videoBitrate"] },
          },
        ],
      },
    ),
    destination: s.requiredObject("Optional external output storage.", { external: destinationExternal }),
    notifications: s.requiredObject("Video completion and failure notifications.", {
      webhookUrl: s.url("URL for Topaz webhook notifications."),
    }),
  },
  {
    optional: ["destination", "notifications"],
    allOf: [
      {
        if: {
          required: ["filters"],
          properties: {
            filters: {
              contains: {
                required: ["model"],
                properties: { model: { enum: ["aion-1", "apf-2", "apo-8", "chf-3", "chr-2"] } },
                not: { required: ["fps"] },
              },
            },
          },
        },
        then: { properties: { output: { required: ["frameRate"] } } },
      },
    ],
  },
);
