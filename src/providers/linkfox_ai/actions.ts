import type { DefineProviderActionInput } from "../../core/provider-definition.ts";
import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linkfox_ai";
const taskId = s.string("Task ID as an exact decimal string.", { pattern: "^[0-9]+$" });
const traceId = s.string("LinkFox AI request trace ID.");
const model = s.nonWhitespaceString("Public model code returned by list_video_models.");
const prompt = s.nonWhitespaceString("Instructions for generating or editing the video.");
const referenceImageUrls = s.stringArray("Reference images for the selected model.", {
  itemDescription: "Public reference image URL.",
});
const referenceAudioUrls = s.stringArray("Reference audio for the selected model.", {
  itemDescription: "Public reference audio URL.",
});
const useAssetWhitelist = s.boolean("Whether to use allowlisted media library assets.");
const generationFields = {
  model,
  prompt,
  duration: s.integer("Requested video duration in seconds."),
  resolution: s.string("Output resolution supported by the model."),
  aspectRatio: s.string("Output aspect ratio supported by the model."),
  firstFrameImageUrl: s.nonWhitespaceString("Public URL of the opening frame."),
  lastFrameImageUrl: s.nonWhitespaceString("Public URL of the closing frame."),
  referenceImageUrls,
  referenceVideoUrls: s.stringArray("Reference videos for the selected model.", {
    itemDescription: "Public reference video URL.",
  }),
  voice: s.boolean("Whether to enable sound on models with an audio switch."),
  promptOptimizer: s.boolean("Whether LinkFox AI should optimize the prompt."),
  useAssetWhitelist,
};
const submission: Omit<DefineProviderActionInput, "name" | "description" | "inputSchema"> = {
  operationType: "write",
  requiredScopes: [],
  asyncLifecycle: { startActionId: "linkfox_ai.submit_video_generation", statusActionId: "linkfox_ai.get_video_task" },
  outputSchema: s.actionOutput({ taskId, traceId }, "Submitted video task.", ["taskId"]),
};
const bizType = s.withEnum(s.integer("LinkFox AI video workflow code."), [30, 73, 89, 94, 95, 96]);
const modelConfig = s.object(
  "Video model and supported settings.",
  {
    apiCode: s.string("Public code to pass as model."),
    code: s.string("Provider model code."),
    name: s.string("Model display name."),
    isMaintenance: s.boolean("Whether the model is under maintenance."),
    resolutions: s.stringArray("Supported resolutions.", { itemDescription: "Output resolution." }),
    durations: s.stringArray("Supported durations.", { itemDescription: "Video duration option." }),
    ratios: s.stringArray("Supported aspect ratios.", { itemDescription: "Video aspect ratio." }),
    referenceImageLimit: s.number("Maximum number of reference images."),
    supportsVoice: s.boolean("Whether the model accepts the voice option."),
    supportsLastFrame: s.boolean("Whether the model accepts a closing frame."),
    modes: s.stringArray("Supported generation modes.", { itemDescription: "Generation mode." }),
    offPeak: s.object(
      "Off-peak generation settings.",
      {
        supported: s.boolean("Whether off-peak generation is available."),
        discount: s.number("Off-peak discount reported by the provider."),
        maxWaitHours: s.number("Maximum off-peak wait in hours."),
      },
      { required: [] },
    ),
    pricing: s.record("Model pricing as reported by LinkFox AI.", true),
  },
  { required: ["apiCode", "name", "resolutions", "durations", "ratios"] },
);
const result = s.object(
  "One video task result.",
  {
    id: s.string("Result ID as an exact decimal string."),
    status: s.number("Result status (0 generating, 1 succeeded, 2 failed)."),
    url: s.string("Result media URL."),
    width: s.number("Width in pixels."),
    height: s.number("Height in pixels."),
    format: s.string("Result file format."),
    size: s.number("Result file size in bytes."),
    errorCode: s.string("Provider error code for this result."),
    errorMsg: s.string("Provider error message for this result."),
  },
  { required: [] },
);

export const linkfoxAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_plan_info",
    operationType: "read",
    requiredScopes: [],
    description: "Check team plan points, usage and expiry.",
    inputSchema: s.actionInput({}, [], "Team plan lookup."),
    outputSchema: s.actionOutput(
      {
        total: s.number("Total points in the plan period."),
        usage: s.number("Points used in the plan period."),
        remaining: s.number("Points remaining in the plan period."),
        startTime: s.number("Plan start date in YYYYMMDD format."),
        expireTime: s.number("Latest included points expiry date in YYYYMMDD format."),
        traceId,
      },
      "Team plan balance and dates.",
      ["total", "usage", "remaining"],
    ),
  }),
  defineProviderAction(service, {
    name: "list_video_models",
    operationType: "read",
    requiredScopes: [],
    description: "List video models and their supported settings for a LinkFox AI workflow.",
    inputSchema: s.actionInput({ bizType: s.withDefault(bizType, 94) }, [], "Video model lookup."),
    outputSchema: s.actionOutput(
      { bizType, models: s.array("Models available for this workflow.", modelConfig) },
      "Video model configurations.",
    ),
  }),
  defineProviderAction(service, {
    ...submission,
    name: "submit_video_generation",
    description: "Generate a video from a prompt and optional reference media.",
    inputSchema: s.actionInput(
      {
        ...generationFields,
        referenceAudioUrls,
      },
      ["model", "prompt"],
      "Video generation request.",
    ),
  }),
  defineProviderAction(service, {
    ...submission,
    name: "submit_image_to_video",
    asyncLifecycle: { startActionId: "linkfox_ai.submit_image_to_video", statusActionId: "linkfox_ai.get_video_task" },
    description:
      "Animate a first frame or reference images using a prompt, storyboard mode, or a product video template.",
    inputSchema: s.object(
      {
        ...generationFields,
        referenceImageUrls: { ...referenceImageUrls, minItems: 1 },
        referenceAudioUrls: s.stringArray(
          "Reference audio for the selected model (custom prompt mode only; cannot be combined with templateKey or lastFrameImageUrl).",
          { itemDescription: "Public reference audio URL." },
        ),
        generationMode: s.withDefault(
          s.stringEnum(
            "Generation mode: normal (default) or advanced (storyboard-first; allows omitting prompt, cannot be combined with templateKey).",
            ["normal", "advanced"],
          ),
          "normal",
        ),
        templateKey: s.nonWhitespaceString("Product video template key to use in place of a prompt."),
        productInfo: s.string("Product details for the template."),
        language: s.string("Language for the template video."),
        saleCountry: s.string("Target sales country for the template video."),
      },
      {
        required: ["model"],
        description:
          "Supply exactly one image source; normal mode requires prompt or templateKey while advanced mode allows omitting prompt.",
        ...{
          oneOf: [{ required: ["firstFrameImageUrl"] }, { required: ["referenceImageUrls"] }],
        },
      },
    ),
  }),
  defineProviderAction(service, {
    ...submission,
    name: "submit_video_editing",
    asyncLifecycle: { startActionId: "linkfox_ai.submit_video_editing", statusActionId: "linkfox_ai.get_video_task" },
    description: "Edit an existing video using a prompt and optional reference images.",
    inputSchema: s.actionInput(
      {
        sourceVideoUrl: s.nonWhitespaceString("Public URL of the video to edit."),
        model,
        prompt,
        duration: s.integer("Output duration in seconds, or -1 to follow the source duration on supported models.", {
          minimum: -1,
        }),
        referenceImageUrls,
        useAssetWhitelist,
      },
      ["sourceVideoUrl", "prompt", "model"],
      "Video editing request.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_video_task",
    operationType: "read",
    requiredScopes: [],
    description: "Check a video task and retrieve its available results or failure details.",
    asyncLifecycle: {
      startActionId: "linkfox_ai.submit_video_generation",
      statusActionId: "linkfox_ai.get_video_task",
    },
    inputSchema: s.actionInput(
      {
        taskId,
        containsSyntheticPerformer: s.boolean("Whether to add synthetic performer metadata to supported output files."),
      },
      ["taskId"],
      "Video task lookup.",
    ),
    outputSchema: s.actionOutput(
      {
        taskId,
        state: s.stringEnum("Normalized task state.", ["processing", "succeeded", "failed"]),
        rawStatus: s.number("Provider task status (1 queued, 2 generating, 3 complete, 4 failed)."),
        videoUrl: s.string("First successful video URL when the task succeeds."),
        results: s.array("Individual task results.", result),
        pointsConsumed: s.number("Points consumed by the task."),
        error: s.object(
          "Task failure details.",
          { code: s.string("Task failure code."), message: s.string("Task failure message.") },
          { required: [] },
        ),
        traceId,
      },
      "Video task status and results.",
      ["taskId", "state", "rawStatus"],
    ),
  }),
];
