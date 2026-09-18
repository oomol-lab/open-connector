import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "seedance";

export const defaultSeedanceModel = "doubao-seedance-2-0-260128";
export const fastSeedanceModel = "doubao-seedance-2-0-fast-260128";

const taskIdSchema = s.nonEmptyString("The opaque Seedance task identifier returned by the selected connection.");
const modelSchema: JsonSchema = {
  ...s.withDefault(
    s.nonEmptyString("The Seedance Model ID or Endpoint ID used for Seedance video generation."),
    defaultSeedanceModel,
  ),
  examples: [defaultSeedanceModel],
};
const resolutionSchema = s.stringEnum("The generated video resolution.", ["480p", "720p", "1080p"]);
const omniReferenceTaskTypeSchema = s.stringEnum("Guide Seedance 2.5 when classifying an all-modal reference task.", [
  "auto",
  "reference",
  "edit",
  "extend",
]);
const outputFormatSchema = s.stringEnum("The generated video file format.", ["mp4", "mov"]);
const ratioSchema = s.stringEnum("The generated video aspect ratio.", [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
  "adaptive",
]);
const toolSchema = s.object(
  "A tool available to the Seedance model.",
  { type: s.literal("web_search", { description: "Use web search while generating the video." }) },
  { required: ["type"] },
);
const imageSchema = s.object(
  "An image input for Seedance.",
  {
    url: s.nonEmptyString("A public image URL, data URL, or Volcengine asset identifier."),
    role: s.stringEnum("How Seedance uses this image.", ["first_frame", "last_frame", "reference_image"]),
  },
  { required: ["url"] },
);
const videoSchema = s.object(
  "A reference video input for Seedance.",
  {
    url: s.nonEmptyString("A public video URL or Volcengine asset identifier."),
    role: s.literal("reference_video", { description: "Use the video as a Seedance reference video." }),
  },
  { required: ["url"] },
);
const audioSchema = s.object(
  "A reference audio input for Seedance.",
  {
    url: s.nonEmptyString("A public audio URL, data URL, or Volcengine asset identifier."),
    role: s.literal("reference_audio", { description: "Use the audio as a Seedance reference audio." }),
  },
  { required: ["url"] },
);
const errorSchema = s.object(
  "The terminal error reported by Seedance when the task did not succeed.",
  {
    code: s.string("The upstream error code when provided."),
    message: s.string("The upstream error message when provided."),
  },
  { optional: ["code", "message"] },
);
const usageSchema = s.object(
  "Token and tool usage reported for a succeeded Seedance task.",
  {
    completionTokens: s.nonNegativeInteger("The completion token count."),
    totalTokens: s.nonNegativeInteger("The total token count."),
    toolUsage: s.object(
      "Tool usage reported by Seedance.",
      { webSearch: s.nonNegativeInteger("The web search invocation count.") },
      { optional: ["webSearch"] },
    ),
  },
  { optional: ["completionTokens", "totalTokens", "toolUsage"] },
);

const commonTaskProperties: Record<string, JsonSchema> = {
  taskId: taskIdSchema,
  model: s.string("The model name reported for this task."),
  createdAt: s.integer("The task creation Unix timestamp in seconds."),
  updatedAt: s.integer("The task update Unix timestamp in seconds."),
};

const processingTaskSchema = s.object(
  "A queued or running Seedance task.",
  {
    ...commonTaskProperties,
    state: s.literal("processing", { description: "The task is queued or running." }),
    progress: s.number("The task progress when available.", { minimum: 0, maximum: 100 }),
  },
  { optional: ["model", "createdAt", "updatedAt", "progress"] },
);
const succeededTaskSchema = s.object(
  "A succeeded Seedance video generation task.",
  {
    ...commonTaskProperties,
    state: s.literal("succeeded", { description: "The task succeeded." }),
    videoUrl: s.nonEmptyString("The generated video URL."),
    lastFrameUrl: s.nonEmptyString("The generated final-frame image URL when requested."),
    seed: s.integer("The seed used by the task."),
    resolution: resolutionSchema,
    ratio: ratioSchema,
    duration: s.number("The generated video duration in seconds."),
    frames: s.integer("The generated frame count."),
    framesPerSecond: s.integer("The generated video frame rate."),
    generateAudio: s.boolean("Whether the generated video contains synchronized audio."),
    tools: s.array("The tools used by Seedance.", toolSchema),
    safetyIdentifier: s.string("The end-user safety identifier supplied at submission."),
    serviceTier: s.string("The service tier that processed the task."),
    executionExpiresAfter: s.integer("The task expiration threshold in seconds."),
    usage: usageSchema,
  },
  {
    optional: [
      "model",
      "createdAt",
      "updatedAt",
      "lastFrameUrl",
      "seed",
      "resolution",
      "ratio",
      "duration",
      "frames",
      "framesPerSecond",
      "generateAudio",
      "tools",
      "safetyIdentifier",
      "serviceTier",
      "executionExpiresAfter",
      "usage",
    ],
  },
);

function terminalTaskSchema(state: "failed" | "cancelled" | "expired"): JsonSchema {
  return s.object(
    `A Seedance task in the ${state} terminal state.`,
    {
      ...commonTaskProperties,
      state: s.literal(state, { description: `The task is ${state}.` }),
      error: errorSchema,
    },
    { optional: ["model", "createdAt", "updatedAt", "error"] },
  );
}

export const seedanceTaskSchema: JsonSchema = s.oneOf(
  [
    processingTaskSchema,
    succeededTaskSchema,
    terminalTaskSchema("failed"),
    terminalTaskSchema("cancelled"),
    terminalTaskSchema("expired"),
  ],
  { description: "The normalized Seedance task state." },
);

const submitInputSchema = s.requireAnyProperty(
  s.actionInput(
    {
      model: modelSchema,
      prompt: s.string("The video generation prompt.", { minLength: 1, maxLength: 1000 }),
      omniReferenceTaskType: omniReferenceTaskTypeSchema,
      outputFormat: outputFormatSchema,
      images: s.array("Image inputs for Seedance.", imageSchema),
      videos: s.array("Reference video inputs for Seedance.", videoSchema),
      audios: s.array("Reference audio inputs for Seedance.", audioSchema),
      returnLastFrame: s.withDefault(s.boolean("Whether to return the generated video's final frame."), false),
      executionExpiresAfter: s.integer("The task expiration threshold in seconds.", {
        minimum: 3600,
        maximum: 259200,
      }),
      generateAudio: s.withDefault(
        s.boolean("Whether Seedance should generate synchronized audio for the video."),
        true,
      ),
      tools: s.array("Tools available to Seedance.", toolSchema),
      safetyIdentifier: s.string("A stable privacy-safe identifier for the end user.", {
        minLength: 1,
        maxLength: 64,
      }),
      resolution: s.withDefault(resolutionSchema, "720p"),
      ratio: s.withDefault(ratioSchema, "adaptive"),
      duration: s.withDefault(
        s.integer(
          "The video duration in seconds. Supported values depend on the selected model; -1 lets the model choose.",
        ),
        5,
      ),
      seed: s.integer("The random seed, or -1 for a random seed.", { minimum: -1, maximum: 4294967295 }),
      watermark: s.withDefault(s.boolean("Whether the generated video should contain a watermark."), false),
    },
    [],
    "A structured Seedance video generation request. Provide a prompt or at least one media input.",
  ),
  ["prompt", "images", "videos", "audios"],
);

const lifecycle = {
  startActionId: "seedance.submit_video_generation",
  statusActionId: "seedance.get_video_generation",
};

export const seedanceActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_video_generation",
    operationType: "write",
    description: "Submit an asynchronous Seedance video generation task through Seedance.",
    followUpActions: [lifecycle.statusActionId],
    asyncLifecycle: lifecycle,
    inputSchema: submitInputSchema,
    outputSchema: s.actionOutput({ taskId: taskIdSchema }, "The submitted Seedance task handle."),
  }),
  defineProviderAction(service, {
    name: "get_video_generation",
    operationType: "read",
    description: "Retrieve a Seedance task state and its generated video when available.",
    asyncLifecycle: lifecycle,
    inputSchema: s.actionInput({ taskId: taskIdSchema }, ["taskId"], "A Seedance task lookup."),
    outputSchema: seedanceTaskSchema,
  }),
  defineProviderAction(service, {
    name: "list_video_generations",
    operationType: "read",
    description: "List Seedance video generation tasks visible to the configured Seedance API key.",
    inputSchema: s.actionInput(
      {
        pageNumber: s.integer("The result page number.", { minimum: 1, maximum: 500 }),
        pageSize: s.integer("The number of tasks per page.", { minimum: 1, maximum: 500 }),
        status: s.stringEnum("Filter tasks by upstream status.", [
          "queued",
          "running",
          "cancelled",
          "succeeded",
          "failed",
        ]),
        taskIds: s.array("Filter by exact Seedance task identifiers.", taskIdSchema),
        model: s.nonEmptyString("Filter by an exact Seedance Endpoint ID."),
        serviceTier: s.stringEnum("Filter by the processing service tier.", ["default", "flex"]),
      },
      [],
      "Filters for listing Seedance video generation tasks.",
    ),
    outputSchema: s.actionOutput(
      {
        items: s.array("The matching Seedance tasks.", seedanceTaskSchema),
        total: s.nonNegativeInteger("The total number of matching tasks."),
      },
      "A page of Seedance video generation tasks.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_video_generation",
    operationType: "destructive",
    description: "Cancel a queued Seedance task or delete a task according to Seedance task-state semantics.",
    inputSchema: s.actionInput({ taskId: taskIdSchema }, ["taskId"], "A Seedance task cancellation or deletion."),
    outputSchema: s.actionOutput(
      {
        taskId: taskIdSchema,
        accepted: s.boolean("Whether Seedance accepted the cancellation or deletion."),
      },
      "The Seedance cancellation or deletion result.",
    ),
  }),
];
