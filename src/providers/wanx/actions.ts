import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wanx";
export const defaultImageModel = "wan2.7-image";
export const defaultVideoModel = "wan3.0-video";

const taskIdSchema = s.nonEmptyString("The opaque Wanx task identifier returned by the selected connection.");
const mediaSchema = s.object(
  "A media input for Wan 3.0 video generation.",
  {
    type: s.stringEnum("How Wan 3.0 uses this media.", [
      "first_frame",
      "last_frame",
      "reference_image",
      "reference_video",
      "reference_audio",
      "file",
      "link",
    ]),
    url: s.nonEmptyString("A public URL, OSS temporary URL, or supported image data URL."),
  },
  { required: ["type", "url"] },
);
const videoTaskSchema: JsonSchema = s.oneOf(
  [
    s.object(
      "A queued or running Wan 3.0 task.",
      {
        taskId: taskIdSchema,
        state: s.literal("processing", { description: "The task is queued or running." }),
        progress: s.number("The task progress percentage when available.", { minimum: 0, maximum: 100 }),
      },
      { required: ["taskId", "state"], optional: ["progress"] },
    ),
    s.object(
      "A succeeded Wan 3.0 task.",
      {
        taskId: taskIdSchema,
        state: s.literal("succeeded", { description: "The task succeeded." }),
        videoUrl: s.nonEmptyString("The temporary generated video URL."),
        duration: s.number("The billed generated video duration in seconds."),
        resolution: s.string("The generated video resolution."),
        ratio: s.string("The generated video aspect ratio."),
      },
      { required: ["taskId", "state", "videoUrl"], optional: ["duration", "resolution", "ratio"] },
    ),
    s.object(
      "A terminal Wan 3.0 task that did not succeed.",
      {
        taskId: taskIdSchema,
        state: s.stringEnum("The terminal task state.", ["failed", "cancelled", "expired"]),
        error: s.object(
          "The upstream terminal error.",
          { code: s.string("The upstream error code."), message: s.string("The upstream error message.") },
          { optional: ["code", "message"] },
        ),
      },
      { required: ["taskId", "state"], optional: ["error"] },
    ),
  ],
  { description: "The normalized Wan 3.0 video task state." },
);

const videoLifecycle = {
  startActionId: "wanx.submit_video_generation",
  statusActionId: "wanx.get_video_generation",
};

export const wanxActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "generate_image",
    operationType: "write",
    description: "Generate or edit images with the Wan Image 2.7 family.",
    inputSchema: s.actionInput(
      {
        model: s.withDefault(
          s.stringEnum("The Wan Image 2.7 model.", ["wan2.7-image", "wan2.7-image-pro"]),
          defaultImageModel,
        ),
        prompt: s.string("The image generation or editing prompt.", { minLength: 1, maxLength: 5000 }),
        images: s.array(
          "Reference image URLs or data URLs. Omit for text-to-image generation.",
          s.nonEmptyString("A reference image URL or data URL."),
          { maxItems: 9 },
        ),
        size: s.withDefault(s.nonEmptyString("The output size preset or WIDTH*HEIGHT value."), "2K"),
        imageCount: s.withDefault(s.integer("The number of images to generate.", { minimum: 1, maximum: 4 }), 1),
        negativePrompt: s.string("Content that should not appear in the generated images.", { maxLength: 500 }),
        promptExtend: s.withDefault(s.boolean("Whether Wanx should enhance the prompt."), true),
        watermark: s.withDefault(s.boolean("Whether generated images include a watermark."), false),
        seed: s.integer("The random seed.", { minimum: 0, maximum: 2147483647 }),
      },
      ["prompt"],
      "A unified Wan Image 2.7 generation or editing request.",
    ),
    outputSchema: s.actionOutput(
      {
        images: s.array("The generated temporary image URLs.", s.nonEmptyString("A generated image URL.")),
        imageCount: s.nonNegativeInteger("The number of generated images."),
        size: s.string("The generated image dimensions."),
      },
      "The generated Wanx images and usage.",
    ),
  }),
  defineProviderAction(service, {
    name: "submit_video_generation",
    operationType: "write",
    description: "Submit a unified asynchronous Wan 3.0 video generation task.",
    followUpActions: [videoLifecycle.statusActionId],
    asyncLifecycle: videoLifecycle,
    inputSchema: s.requireAnyProperty(
      s.actionInput(
        {
          model: s.withDefault(
            s.stringEnum("The Wan 3.0 video model.", ["wan3.0-video", "wan3.0-video-prime"]),
            defaultVideoModel,
          ),
          prompt: s.string("The video generation or editing prompt.", { minLength: 1, maxLength: 20000 }),
          media: s.array("Media inputs for Wan 3.0.", mediaSchema, { maxItems: 20 }),
          resolution: s.withDefault(
            s.stringEnum("The generated video resolution.", ["480P", "720P", "1080P"]),
            "1080P",
          ),
          ratio: s.withDefault(
            s.stringEnum("The generated video aspect ratio.", ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"]),
            "adaptive",
          ),
          duration: s.withDefault(s.integer("The video duration in seconds, or -1 for automatic selection."), 5),
          audio: s.withDefault(s.boolean("Whether the generated video contains audio."), true),
          promptExtend: s.withDefault(s.boolean("Whether Wanx should enhance the prompt."), true),
          watermark: s.withDefault(s.boolean("Whether the generated video includes a watermark."), false),
          seed: s.integer("The random seed.", { minimum: 0, maximum: 2147483647 }),
        },
        [],
        "A unified Wan 3.0 video generation request. Provide a prompt or media.",
      ),
      ["prompt", "media"],
    ),
    outputSchema: s.actionOutput({ taskId: taskIdSchema }, "The submitted Wan 3.0 task handle."),
  }),
  defineProviderAction(service, {
    name: "get_video_generation",
    operationType: "read",
    description: "Retrieve a Wan 3.0 video task state and output.",
    asyncLifecycle: videoLifecycle,
    inputSchema: s.actionInput({ taskId: taskIdSchema }, ["taskId"], "A Wan 3.0 task lookup."),
    outputSchema: videoTaskSchema,
  }),
];
