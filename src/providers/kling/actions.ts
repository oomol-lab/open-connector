import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { defaultKlingModel, klingModelDefinitions, klingModels } from "./models.ts";

const service = "kling";

const taskIdSchema = s.string("The opaque Kling AI task handle returned by the selected connection.", {
  minLength: 1,
  maxLength: 512,
});
const modelSchema = s.withDefault(s.stringEnum("The Kling AI video model.", klingModels), defaultKlingModel);
const resolutionSchema = s.stringEnum("Output resolution. Defaults to 1080p for Kling 4.0, otherwise 720p.", [
  "720p",
  "1080p",
  "4k",
]);
const audioModeSchema = s.stringEnum("How the generated video uses audio.", ["off", "native", "original"]);
const mediaSchema = s.object(
  "A URL-based image or video input for Kling AI.",
  {
    role: s.stringEnum("How Kling AI uses this media input.", [
      "first_frame",
      "middle_frame",
      "last_frame",
      "reference_image",
      "reference_video",
      "source_video",
    ]),
    url: s.string("A public HTTP or HTTPS media URL passed to Kling AI.", {
      format: "uri",
      pattern: "^[hH][tT][tT][pP][sS]?:\\/\\/",
      maxLength: 8192,
    }),
    referenceId: s.string("A request-unique identifier that can be referenced as @referenceId in prompts.", {
      minLength: 1,
      maxLength: 256,
    }),
  },
  { optional: ["referenceId"] },
);
const shotSchema = s.requiredObject("One custom multi-shot segment.", {
  prompt: s.string("The prompt for this shot.", {
    minLength: 1,
    maxLength: 512,
  }),
  duration: s.integer("The shot duration in seconds.", { minimum: 1, maximum: 15 }),
});
const multiShotSchema = s.object(
  "Kling 3 multi-shot settings. For Kling 4, describe shots directly in the prompt.",
  {
    mode: s.stringEnum("Whether Kling AI plans shots or uses the supplied custom shots.", ["intelligent", "custom"]),
    shots: s.array("The ordered shots used by custom mode.", shotSchema, {
      minItems: 1,
      maxItems: 6,
    }),
  },
  { optional: ["shots"] },
);
const errorSchema = s.object(
  "The terminal error reported for a Kling AI task.",
  {
    code: s.string("The upstream terminal error code when available."),
    message: s.string("The upstream terminal error message when available."),
  },
  { optional: ["code", "message"] },
);
const commonTaskProperties: Record<string, JsonSchema> = {
  taskId: taskIdSchema,
  createdAt: s.integer("The task creation Unix timestamp in milliseconds."),
  updatedAt: s.integer("The task update Unix timestamp in milliseconds."),
};
const processingTaskSchema = s.object(
  "A submitted or processing Kling AI task.",
  {
    ...commonTaskProperties,
    state: s.literal("processing", { description: "The task is submitted or processing." }),
  },
  { optional: ["createdAt", "updatedAt"] },
);
const succeededTaskSchema = s.object(
  "A succeeded Kling AI video generation task.",
  {
    ...commonTaskProperties,
    state: s.literal("succeeded", { description: "The task succeeded." }),
    videoUrl: s.nonEmptyString("The temporary generated video URL."),
    watermarkVideoUrl: s.nonEmptyString("The temporary watermarked video URL when requested."),
    duration: s.number("The generated video duration in seconds."),
    resolution: s.string("The generated video resolution when reported."),
    framesPerSecond: s.integer("The generated video frame rate when reported."),
    audioMode: audioModeSchema,
  },
  {
    optional: ["watermarkVideoUrl", "duration", "resolution", "framesPerSecond", "audioMode", "createdAt", "updatedAt"],
  },
);

function terminalTaskSchema(state: "failed" | "cancelled" | "expired"): JsonSchema {
  return s.object(
    `A Kling AI task in the ${state} terminal state.`,
    {
      ...commonTaskProperties,
      state: s.literal(state, { description: `The task is ${state}.` }),
      error: errorSchema,
    },
    { optional: ["error", "createdAt", "updatedAt"] },
  );
}

const klingTaskSchema: JsonSchema = {
  oneOf: [
    processingTaskSchema,
    succeededTaskSchema,
    terminalTaskSchema("failed"),
    terminalTaskSchema("cancelled"),
    terminalTaskSchema("expired"),
  ],
  description: "The normalized Kling AI task state.",
};

const multimodalModels = klingModels.filter((model) => klingModelDefinitions[model].multimodal);
const hdrModels = klingModels.filter((model) => klingModelDefinitions[model].multimodal?.dynamicRange);

const submitCrossFieldConstraints: JsonSchema[] = [
  {
    if: { properties: { model: { enum: multimodalModels } }, required: ["model"] },
    then: {
      required: ["prompt"],
      not: { required: ["multiShot"] },
      properties: { audioMode: { enum: ["native", "original"] } },
    },
    else: {
      properties: {
        duration: { maximum: 15 },
        prompt: { maxLength: 2500 },
        media: { maxItems: 9 },
        aspectRatio: { enum: ["16:9", "9:16", "1:1"] },
      },
      not: {
        anyOf: [{ required: ["dynamicRange"] }, { required: ["elements"] }, { required: ["voices"] }],
      },
    },
  },
  ...multimodalModels.map((model): JsonSchema => {
    const limits = klingModelDefinitions[model].multimodal!;
    return {
      if: { properties: { model: { const: model } }, required: ["model"] },
      then: {
        properties: {
          resolution: { enum: limits.resolutions },
          duration: { maximum: limits.maxDuration },
          dynamicRange: limits.dynamicRange ? { enum: ["sdr", "hdr"] } : false,
          voices: limits.maxVoices ? { maxItems: limits.maxVoices } : false,
          media: {
            items: {
              properties: {
                role: {
                  enum: limits.frameSequence
                    ? [
                        "first_frame",
                        "middle_frame",
                        "last_frame",
                        "reference_image",
                        "reference_video",
                        "source_video",
                      ]
                    : ["first_frame", "reference_image", "reference_video", "source_video"],
                },
              },
            },
          },
        },
      },
    };
  }),
  {
    if: { properties: { dynamicRange: { const: "hdr" } }, required: ["dynamicRange"] },
    then: { properties: { model: { enum: hdrModels }, resolution: { enum: ["1080p", "4k"] } } },
  },

  {
    if: { properties: { model: { const: "kling-3.0-turbo" } }, required: ["model"] },
    then: {
      properties: {
        resolution: { type: "string", enum: ["720p", "1080p"] },
        audioMode: { type: "string", enum: ["native"] },
        media: {
          type: "array",
          maxItems: 1,
          items: {
            type: "object",
            properties: { role: { const: "first_frame" } },
            required: ["role"],
          },
        },
      },
    },
  },
  {
    if: {
      anyOf: [{ properties: { model: { const: "kling-3.0" } }, required: ["model"] }, { not: { required: ["model"] } }],
    },
    then: {
      properties: {
        audioMode: { type: "string", enum: ["off", "native"] },
        media: {
          type: "array",
          maxItems: 2,
          items: {
            type: "object",
            properties: { role: { enum: ["first_frame", "last_frame"] } },
            required: ["role"],
          },
        },
      },
    },
  },
  {
    if: {
      properties: {
        multiShot: {
          type: "object",
          properties: { mode: { const: "custom" } },
          required: ["mode"],
        },
      },
      required: ["multiShot"],
    },
    then: {
      not: { required: ["prompt"] },
      properties: { multiShot: { required: ["mode", "shots"] } },
    },
  },
  {
    if: {
      properties: {
        multiShot: {
          type: "object",
          properties: { mode: { const: "intelligent" } },
          required: ["mode"],
        },
      },
      required: ["multiShot"],
    },
    then: {
      required: ["prompt"],
      properties: { multiShot: { not: { required: ["shots"] } } },
    },
  },
  {
    if: { properties: { audioMode: { const: "original" } }, required: ["audioMode"] },
    then: {
      required: ["model", "media"],
      properties: {
        model: { enum: ["kling-3.0-omni", ...multimodalModels] },
        media: {
          type: "array",
          contains: {
            type: "object",
            properties: { role: { enum: ["reference_video", "source_video"] } },
            required: ["role"],
          },
        },
      },
    },
  },
  {
    if: {
      not: {
        properties: { model: { enum: multimodalModels } },
        required: ["model"],
      },
      required: ["media"],
      properties: {
        media: {
          type: "array",
          contains: {
            type: "object",
            properties: { role: { const: "last_frame" } },
            required: ["role"],
          },
        },
      },
    },
    then: {
      properties: {
        media: {
          type: "array",
          contains: {
            type: "object",
            properties: { role: { const: "first_frame" } },
            required: ["role"],
          },
        },
      },
    },
  },
];

const klingSubmitInputSchema: JsonSchema = s.object(
  {
    model: modelSchema,
    prompt: s.string(
      "The video prompt with @referenceId references. Kling 3: up to 2500 characters. Kling 4: 26000 English or 11000 non-English characters; mixed-language limits apply.",
      {
        minLength: 1,
        maxLength: 26000,
      },
    ),
    media: s.array("URL-based media inputs for Kling AI.", mediaSchema, { maxItems: 15 }),
    resolution: resolutionSchema,
    aspectRatio: s.stringEnum("Output aspect ratio. Defaults to adaptive for Kling 4, otherwise 16:9.", [
      "16:9",
      "9:16",
      "1:1",
      "21:9",
      "4:3",
      "3:4",
      "adaptive",
    ]),
    duration: s.integer(
      "Requested seconds: Kling 3 defaults to 5; Kling 4 may infer duration from the prompt or base video, otherwise 10.",
      { minimum: 3, maximum: 30 },
    ),
    audioMode: audioModeSchema,
    multiShot: multiShotSchema,
    dynamicRange: s.stringEnum("Kling 4.0 output dynamic range. HDR requires 1080p or 4k.", ["sdr", "hdr"]),
    elements: s.array(
      "Kling 4 subject references. At most 3 video subjects; video subjects plus videos must not exceed 5.",
      s.requiredObject("A subject reference.", {
        elementId: s.string("The official or owned subject ID.", { minLength: 1 }),
        referenceId: s.string("A unique reference ID used as @referenceId in the prompt.", {
          minLength: 1,
        }),
      }),
      { maxItems: 7 },
    ),
    voices: s.array(
      "Kling 4.0 voice references, unavailable with original audio or Flash.",
      s.requiredObject("A voice reference.", {
        voiceId: s.string("The official or owned voice ID.", { minLength: 1 }),
        referenceId: s.string("A unique reference ID used as @referenceId in the prompt.", {
          minLength: 1,
        }),
      }),
      { maxItems: 3 },
    ),
    watermark: s.withDefault(s.boolean("Whether Kling AI should also generate a watermarked video."), false),
  },
  {
    required: [],
    description: "A unified Kling AI video generation request.",
    ...{
      anyOf: [{ required: ["prompt"] }, { required: ["multiShot"] }],
      allOf: submitCrossFieldConstraints,
    },
  },
);

const resultActionId = "kling.get_video_generation";

export const klingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_video_generation",
    operationType: "write",
    requiredScopes: [],
    description: "Submit an asynchronous Kling AI video generation task.",
    followUpActions: [resultActionId],
    asyncLifecycle: { startActionId: "kling.submit_video_generation", statusActionId: "kling.get_video_generation" },
    inputSchema: klingSubmitInputSchema,
    outputSchema: s.actionOutput({ taskId: taskIdSchema }, "The submitted Kling AI task handle."),
  }),
  defineProviderAction(service, {
    name: "get_video_generation",
    operationType: "read",
    requiredScopes: [],
    description: "Retrieve a Kling AI task state and its generated video when available.",
    asyncLifecycle: { startActionId: "kling.submit_video_generation", statusActionId: "kling.get_video_generation" },
    inputSchema: s.actionInput({ taskId: taskIdSchema }, ["taskId"], "A Kling AI task lookup."),
    outputSchema: klingTaskSchema,
  }),
];
