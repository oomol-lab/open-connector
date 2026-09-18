import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kling";

export const defaultKlingModel = "kling-3.0";
export const klingModels = ["kling-3.0-turbo", "kling-3.0", "kling-3.0-omni"] as const;
export const klingPromptMaxLength = 2500;

const taskIdSchema = s.nonWhitespaceString("The opaque Kling AI task handle returned by the selected connection.", {
  maxLength: 512,
});
const modelSchema = s.withDefault(s.stringEnum("The Kling AI V3 video model.", klingModels), defaultKlingModel);
const resolutionSchema = s.withDefault(
  s.stringEnum("The generated video resolution.", ["720p", "1080p", "4k"]),
  "720p",
);
const audioModeSchema = s.stringEnum("How the generated video uses audio.", ["off", "native", "original"]);
const mediaSchema = s.object(
  "A URL-based image or video input for Kling AI.",
  {
    role: s.stringEnum("How Kling AI uses this media input.", [
      "first_frame",
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
    referenceId: s.nonWhitespaceString(
      "A request-unique identifier that can be referenced as @referenceId in prompts.",
      { maxLength: 256 },
    ),
  },
  { required: ["role", "url"], optional: ["referenceId"] },
);
const shotSchema = s.object(
  "One custom multi-shot segment.",
  {
    prompt: s.nonWhitespaceString("The prompt for this shot.", { maxLength: 512 }),
    duration: s.integer("The shot duration in seconds.", { minimum: 1, maximum: 15 }),
  },
  { required: ["prompt", "duration"] },
);
const multiShotSchema = s.object(
  "A Kling AI multi-shot generation mode.",
  {
    mode: s.stringEnum("Whether Kling AI plans shots or uses the supplied custom shots.", ["intelligent", "custom"]),
    shots: s.array("The ordered shots used by custom mode.", shotSchema, { minItems: 1, maxItems: 6 }),
  },
  { required: ["mode"], optional: ["shots"] },
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
  { required: ["taskId", "state"], optional: ["createdAt", "updatedAt"] },
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
    required: ["taskId", "state", "videoUrl"],
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
    { required: ["taskId", "state"], optional: ["error", "createdAt", "updatedAt"] },
  );
}

const klingTaskSchema: JsonSchema = s.oneOf(
  [
    processingTaskSchema,
    succeededTaskSchema,
    terminalTaskSchema("failed"),
    terminalTaskSchema("cancelled"),
    terminalTaskSchema("expired"),
  ],
  { description: "The normalized Kling AI task state." },
);

const submitCrossFieldConstraints: JsonSchema[] = [
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
        model: { const: "kling-3.0-omni" },
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

const klingSubmitInputSchema: JsonSchema = {
  ...s.requireAnyProperty(
    s.actionInput(
      {
        model: modelSchema,
        prompt: s.nonWhitespaceString("The video prompt, including any @referenceId media references.", {
          maxLength: klingPromptMaxLength,
        }),
        media: s.array("URL-based media inputs for Kling AI.", mediaSchema, { maxItems: 9 }),
        resolution: resolutionSchema,
        aspectRatio: s.withDefault(
          s.stringEnum("The generated aspect ratio when it is not inherited from input media.", [
            "16:9",
            "9:16",
            "1:1",
          ]),
          "16:9",
        ),
        duration: s.withDefault(s.integer("The requested video duration in seconds.", { minimum: 3, maximum: 15 }), 5),
        audioMode: audioModeSchema,
        multiShot: multiShotSchema,
        watermark: s.withDefault(s.boolean("Whether Kling AI should also generate a watermarked video."), false),
      },
      [],
      "A unified Kling AI V3 video generation request.",
    ),
    ["prompt", "multiShot"],
  ),
  allOf: submitCrossFieldConstraints,
};

const lifecycle = {
  startActionId: "kling.submit_video_generation",
  statusActionId: "kling.get_video_generation",
};

export const klingActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_video_generation",
    operationType: "write",
    description: "Submit an asynchronous Kling AI V3 video generation task.",
    followUpActions: [lifecycle.statusActionId],
    asyncLifecycle: lifecycle,
    inputSchema: klingSubmitInputSchema,
    outputSchema: s.actionOutput({ taskId: taskIdSchema }, "The submitted Kling AI task handle."),
  }),
  defineProviderAction(service, {
    name: "get_video_generation",
    operationType: "read",
    description: "Retrieve a Kling AI task state and its generated video when available.",
    asyncLifecycle: lifecycle,
    inputSchema: s.actionInput({ taskId: taskIdSchema }, ["taskId"], "A Kling AI task lookup."),
    outputSchema: klingTaskSchema,
  }),
];
