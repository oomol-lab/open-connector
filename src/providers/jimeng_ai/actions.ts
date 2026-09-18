import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jimeng_ai";

const promptSchema = s.string("The prompt used to generate or edit content.", { minLength: 1, maxLength: 800 });
const imageUrlSchema = s.url("A public JPEG or PNG image URL.");
const taskIdSchema = s.nonEmptyString("The Jimeng async task identifier.");
const rawPayloadSchema = s.looseObject("The raw upstream response payload.");

const logoInfoSchema = s.object(
  "Visible watermark configuration sent to Jimeng.",
  {
    add_logo: s.boolean("Whether Jimeng should add a visible watermark."),
    position: s.integer("The watermark position: 0 bottom-right, 1 bottom-left, 2 top-left, 3 top-right.", {
      minimum: 0,
      maximum: 3,
    }),
    language: s.integer("The watermark language: 0 Chinese, 1 English.", { minimum: 0, maximum: 1 }),
    opacity: s.number("The visible watermark opacity between 0 and 1.", { minimum: 0, maximum: 1 }),
    logo_text_content: s.string("Custom visible watermark text content."),
  },
  { optional: ["add_logo", "position", "language", "opacity", "logo_text_content"] },
);
const aigcMetaSchema = s.object(
  "AIGC metadata configuration embedded in generated content.",
  {
    content_producer: s.string("The content generation service ID."),
    producer_id: s.string("The producer-specific generated image identifier.", { minLength: 1 }),
    content_propagator: s.string("The content propagation service ID."),
    propagate_id: s.string("The propagator-specific generated image ID."),
  },
  { optional: ["content_producer", "content_propagator", "propagate_id"] },
);
const imageTaskOutputSchema = s.object(
  "The Jimeng task submission result.",
  {
    task_id: taskIdSchema,
    request_id: s.string("The Volcengine request identifier."),
    message: s.string("The upstream response message."),
    time_elapsed: s.string("The upstream request processing time."),
    raw: rawPayloadSchema,
  },
  { optional: ["request_id", "message", "time_elapsed", "raw"] },
);
const imageResultOutputSchema = s.object(
  "The Jimeng async image task result.",
  {
    task_id: taskIdSchema,
    status: s.string("The Jimeng task status."),
    is_done: s.boolean("Whether the Jimeng task has reached the done status."),
    image_urls: s.array("The generated image URLs returned by Jimeng.", s.string("Image URL.")),
    request_id: s.string("The Volcengine request identifier."),
    message: s.string("The upstream response message."),
    time_elapsed: s.string("The upstream request processing time."),
    raw: rawPayloadSchema,
  },
  { optional: ["request_id", "message", "time_elapsed", "raw"] },
);
const videoResultOutputSchema = s.object(
  "The Jimeng async video task result.",
  {
    task_id: taskIdSchema,
    status: s.string("The Jimeng task status."),
    is_done: s.boolean("Whether the Jimeng task has reached the done status."),
    video_url: s.string("The generated video URL returned by Jimeng."),
    request_id: s.string("The Volcengine request identifier."),
    message: s.string("The upstream response message."),
    time_elapsed: s.string("The upstream request processing time."),
    raw: rawPayloadSchema,
  },
  { optional: ["video_url", "request_id", "message", "time_elapsed", "raw"] },
);

const widthHeightFields = {
  width: s.positiveInteger("The output image width in pixels."),
  height: s.positiveInteger("The output image height in pixels."),
};
const imageQueryOptions = {
  logo_info: logoInfoSchema,
  aigc_meta: aigcMetaSchema,
};

function advancedImageInput(maxImages: number, scaleSchema: JsonSchema): JsonSchema {
  return s.object(
    "Input parameters for submitting a Jimeng image generation task. Use image_urls only when providing reference images. Do not send base64-encoded image content.",
    {
      image_urls: s.array(`Reference image URLs. Jimeng accepts up to ${maxImages} images.`, imageUrlSchema, {
        maxItems: maxImages,
      }),
      prompt: promptSchema,
      size: s.integer("The target output image area in pixels.", {
        minimum: 1024 * 1024,
        maximum: 4096 * 4096,
      }),
      ...widthHeightFields,
      scale: scaleSchema,
      force_single: s.boolean("Whether Jimeng should force a single-image result."),
      min_ratio: s.number("The minimum output width-to-height ratio.", { minimum: 1 / 16, maximum: 16 }),
      max_ratio: s.number("The maximum output width-to-height ratio.", { minimum: 1 / 16, maximum: 16 }),
      callback_url: s.url("A public callback URL Jimeng should call when the async task completes."),
      return_url: s.boolean("Whether callback payloads should return image URLs."),
      ...imageQueryOptions,
    },
    {
      optional: [
        "image_urls",
        "size",
        "width",
        "height",
        "scale",
        "force_single",
        "min_ratio",
        "max_ratio",
        "callback_url",
        "return_url",
        "logo_info",
        "aigc_meta",
      ],
      additionalProperties: true,
    },
  );
}

const imageGeneration40InputSchema = advancedImageInput(
  10,
  s.number("The prompt influence strength between 0 and 1.", { minimum: 0, maximum: 1 }),
);
const imageGeneration46InputSchema = advancedImageInput(
  14,
  s.integer("The prompt influence strength between 1 and 100.", { minimum: 1, maximum: 100 }),
);
const textToImageInputSchema = s.object(
  "Input parameters for submitting a Jimeng text-to-image task.",
  {
    prompt: promptSchema,
    use_pre_llm: s.boolean("Whether Jimeng should expand and optimize the prompt before generation."),
    seed: s.integer("The random seed. Use -1 or omit it for a random seed.", { minimum: -1 }),
    ...widthHeightFields,
  },
  { optional: ["use_pre_llm", "seed", "width", "height"] },
);
const upscaleInputSchema = s.object(
  "Input parameters for submitting a Jimeng smart upscale task. Use image_url only. Do not send base64-encoded image content.",
  {
    image_url: imageUrlSchema,
    resolution: s.stringEnum("The target upscale resolution.", ["4k", "8k"]),
    scale: s.integer("The detail generation strength between 0 and 100.", { minimum: 0, maximum: 100 }),
  },
  { optional: ["resolution", "scale"], additionalProperties: true },
);
const imageGetResultInputSchema = s.object(
  "Input parameters for querying a Jimeng image task result.",
  {
    task_id: taskIdSchema,
    ...imageQueryOptions,
  },
  { optional: ["logo_info", "aigc_meta"] },
);
const aspectRatioSchema = s.stringEnum("The output video aspect ratio.", ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]);
const videoCommonFields = {
  prompt: promptSchema,
  seed: s.integer("The random seed. Use -1 or omit it for a random seed.", { minimum: -1 }),
  frames: s.integer("The supported frame count option.", { minimum: 121, maximum: 241 }),
  aspect_ratio: aspectRatioSchema,
};
const videoGeneration30TextInputSchema = s.object(
  "Input parameters for submitting a Jimeng AI Video Generation 3.0 text-to-video task.",
  videoCommonFields,
  { optional: ["seed", "frames", "aspect_ratio"] },
);
const videoGeneration30ProInputSchema = s.object(
  "Input parameters for submitting a Jimeng AI Video Generation 3.0 Pro task. Provide prompt or one reference image URL. Do not send base64-encoded image content.",
  {
    ...videoCommonFields,
    image_urls: s.array("Reference image URLs. Jimeng accepts exactly one image URL.", imageUrlSchema, {
      minItems: 1,
      maxItems: 1,
    }),
  },
  { optional: ["prompt", "seed", "frames", "aspect_ratio", "image_urls"], additionalProperties: true },
);

function imageToVideoInput(description: string, imageCount: number, imageDescription: string): JsonSchema {
  return s.object(
    description,
    {
      ...videoCommonFields,
      image_urls: s.array(imageDescription, imageUrlSchema, {
        minItems: imageCount,
        maxItems: imageCount,
      }),
    },
    { optional: ["seed", "frames", "aspect_ratio"], additionalProperties: true },
  );
}

const imageToVideoFirstFrameInputSchema = imageToVideoInput(
  "Input parameters for submitting a Jimeng AI Video Generation 3.0 image-to-video first-frame task. Use image_urls only. Do not send base64-encoded image content.",
  1,
  "First frame image URL. Jimeng accepts exactly one public JPEG or PNG image URL.",
);
const imageToVideoFirstTailFrameInputSchema = imageToVideoInput(
  "Input parameters for submitting a Jimeng AI Video Generation 3.0 image-to-video first-and-last-frame task. Use image_urls only. Do not send base64-encoded image content.",
  2,
  "First and last frame image URLs, in that order. Jimeng accepts exactly two public JPEG or PNG image URLs.",
);
const durationSchema = s.stringEnum("The desired video duration preset.", ["～15s", "～30s", "40～60s"]);
const ratioSchema = s.stringEnum("The output video ratio preset.", ["16:9", "9:16", "4:3", "3:4"]);
const languageSchema = s.stringEnum("The generated language preset.", [
  "Chinese",
  "English",
  "Japanese",
  "Thai",
  "SouthAfrican",
  "French",
  "Turkish",
  "Malay",
  "German",
  "Korean",
  "Russian",
  "Spanish",
  "Indonesian",
  "Italian",
  "Portuguese",
  "Filipino",
  "Vietnamese",
  "Dutch",
  "Arabic",
]);
const smartVideoImageListSchema = s.array("Reference image URLs for the video generation agent.", imageUrlSchema, {
  maxItems: 50,
});
const smartVideoUrlListSchema = s.array(
  "Reference video URLs for the video generation agent.",
  s.url("A public reference video URL."),
  { maxItems: 50 },
);
const smartVideoAgent10InputSchema = s.object(
  "Input parameters for submitting a Lilinque Smart Video Agent 1.0 task.",
  {
    prompt: promptSchema,
    img_url_list: smartVideoImageListSchema,
    video_url_list: smartVideoUrlListSchema,
    duration: durationSchema,
    ratio: ratioSchema,
    language: languageSchema,
  },
  { optional: ["img_url_list", "video_url_list", "duration", "ratio", "language"] },
);
const smartVideoAgent20WithReferenceInputSchema = s.object(
  "Input parameters for submitting a Lilinque Smart Video Agent 2.0 task with reference videos.",
  {
    prompt: promptSchema,
    img_url_list: smartVideoImageListSchema,
    video_url_list: smartVideoUrlListSchema,
    duration: durationSchema,
    ratio: ratioSchema,
    language: languageSchema,
  },
  { optional: ["img_url_list", "duration", "ratio", "language"] },
);
const smartVideoAgent20WithoutReferenceInputSchema = s.object(
  "Input parameters for submitting a Lilinque Smart Video Agent 2.0 task without reference videos.",
  {
    prompt: promptSchema,
    img_url_list: smartVideoImageListSchema,
    duration: durationSchema,
    ratio: ratioSchema,
    language: languageSchema,
  },
  { optional: ["img_url_list", "duration", "ratio", "language"] },
);
const marketingVideoAgentInputSchema = s.object(
  "Input parameters for submitting a Lilinque Marketing Video Agent task.",
  {
    product_name: s.nonEmptyString("The product name used to generate the marketing video."),
    product_img_url_list: s.array("Product image URLs. Jimeng accepts exactly one product image.", imageUrlSchema, {
      minItems: 1,
      maxItems: 1,
    }),
    model_img_url_list: s.array("Optional model image URLs. Jimeng accepts exactly one model image.", imageUrlSchema, {
      minItems: 1,
      maxItems: 1,
    }),
  },
  { optional: ["model_img_url_list"] },
);
const videoGetResultInputSchema = s.object("Input parameters for querying a Jimeng video task result.", {
  task_id: taskIdSchema,
});

export type JimengAiActionName =
  | "submit_image_generation_4_0"
  | "get_image_generation_4_0_result"
  | "submit_image_generation_4_6"
  | "get_image_generation_4_6_result"
  | "submit_smart_upscale"
  | "get_smart_upscale_result"
  | "submit_text_to_image_3_1"
  | "get_text_to_image_3_1_result"
  | "submit_text_to_image_3_0"
  | "get_text_to_image_3_0_result"
  | "submit_video_generation_3_0_pro"
  | "get_video_generation_3_0_pro_result"
  | "submit_video_generation_3_0_720p"
  | "get_video_generation_3_0_720p_result"
  | "submit_video_generation_3_0_1080p"
  | "get_video_generation_3_0_1080p_result"
  | "submit_image_to_video_first_frame_3_0_720p"
  | "submit_image_to_video_first_tail_frame_3_0_720p"
  | "submit_image_to_video_first_frame_3_0_1080p"
  | "submit_image_to_video_first_tail_frame_3_0_1080p"
  | "submit_smart_video_agent_1_0"
  | "get_smart_video_agent_1_0_result"
  | "submit_smart_video_agent_2_0_with_reference"
  | "get_smart_video_agent_2_0_with_reference_result"
  | "submit_smart_video_agent_2_0_without_reference"
  | "get_smart_video_agent_2_0_without_reference_result"
  | "submit_marketing_video_agent"
  | "get_marketing_video_agent_result";

function submitAction(input: {
  name: JimengAiActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  followUpActionId: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    name: input.name,
    operationType: input.operationType,
    description: input.description,
    followUpActions: [input.followUpActionId],
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema ?? imageTaskOutputSchema,
  });
}

function getResultAction(input: {
  name: JimengAiActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  outputSchema?: JsonSchema;
  inputSchema?: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    name: input.name,
    operationType: input.operationType,
    description: input.description,
    inputSchema: input.inputSchema ?? imageGetResultInputSchema,
    outputSchema: input.outputSchema ?? imageResultOutputSchema,
  });
}

export const jimengAiActions: ActionDefinition[] = [
  submitAction({
    name: "submit_image_generation_4_0",
    operationType: "write",
    description: "Submit a Jimeng AI Image Generation 4.0 async task.",
    followUpActionId: "jimeng_ai.get_image_generation_4_0_result",
    inputSchema: imageGeneration40InputSchema,
  }),
  getResultAction({
    name: "get_image_generation_4_0_result",
    operationType: "read",
    description: "Get the result of a Jimeng AI Image Generation 4.0 async task.",
  }),
  submitAction({
    name: "submit_image_generation_4_6",
    operationType: "write",
    description: "Submit a Jimeng AI Image Generation 4.6 async task.",
    followUpActionId: "jimeng_ai.get_image_generation_4_6_result",
    inputSchema: imageGeneration46InputSchema,
  }),
  getResultAction({
    name: "get_image_generation_4_6_result",
    operationType: "read",
    description: "Get the result of a Jimeng AI Image Generation 4.6 async task.",
  }),
  submitAction({
    name: "submit_smart_upscale",
    operationType: "write",
    description: "Submit a Jimeng AI Smart Upscale async task.",
    followUpActionId: "jimeng_ai.get_smart_upscale_result",
    inputSchema: upscaleInputSchema,
  }),
  getResultAction({
    name: "get_smart_upscale_result",
    operationType: "read",
    description: "Get the result of a Jimeng AI Smart Upscale async task.",
  }),
  submitAction({
    name: "submit_text_to_image_3_1",
    operationType: "write",
    description: "Submit a Jimeng Text-to-Image 3.1 async task.",
    followUpActionId: "jimeng_ai.get_text_to_image_3_1_result",
    inputSchema: textToImageInputSchema,
  }),
  getResultAction({
    name: "get_text_to_image_3_1_result",
    operationType: "read",
    description: "Get the result of a Jimeng Text-to-Image 3.1 async task.",
  }),
  submitAction({
    name: "submit_text_to_image_3_0",
    operationType: "write",
    description: "Submit a Jimeng Text-to-Image 3.0 async task.",
    followUpActionId: "jimeng_ai.get_text_to_image_3_0_result",
    inputSchema: textToImageInputSchema,
  }),
  getResultAction({
    name: "get_text_to_image_3_0_result",
    operationType: "read",
    description: "Get the result of a Jimeng Text-to-Image 3.0 async task.",
  }),
  submitAction({
    name: "submit_video_generation_3_0_pro",
    operationType: "write",
    description: "Submit a Jimeng AI Video Generation 3.0 Pro async task.",
    followUpActionId: "jimeng_ai.get_video_generation_3_0_pro_result",
    inputSchema: videoGeneration30ProInputSchema,
  }),
  getResultAction({
    name: "get_video_generation_3_0_pro_result",
    operationType: "read",
    description: "Get the result of a Jimeng AI Video Generation 3.0 Pro async task.",
    inputSchema: videoGetResultInputSchema,
    outputSchema: videoResultOutputSchema,
  }),
  submitAction({
    name: "submit_video_generation_3_0_720p",
    operationType: "write",
    description: "Submit a Jimeng AI Video Generation 3.0 720P async task.",
    followUpActionId: "jimeng_ai.get_video_generation_3_0_720p_result",
    inputSchema: videoGeneration30TextInputSchema,
  }),
  getResultAction({
    name: "get_video_generation_3_0_720p_result",
    operationType: "read",
    description: "Get the result of a Jimeng AI Video Generation 3.0 720P async task.",
    inputSchema: videoGetResultInputSchema,
    outputSchema: videoResultOutputSchema,
  }),
  submitAction({
    name: "submit_video_generation_3_0_1080p",
    operationType: "write",
    description: "Submit a Jimeng AI Video Generation 3.0 1080P async task.",
    followUpActionId: "jimeng_ai.get_video_generation_3_0_1080p_result",
    inputSchema: videoGeneration30TextInputSchema,
  }),
  getResultAction({
    name: "get_video_generation_3_0_1080p_result",
    operationType: "read",
    description: "Get the result of a Jimeng AI Video Generation 3.0 1080P async task.",
    inputSchema: videoGetResultInputSchema,
    outputSchema: videoResultOutputSchema,
  }),
  submitAction({
    name: "submit_image_to_video_first_frame_3_0_720p",
    operationType: "write",
    description: "Submit a Jimeng AI Video Generation 3.0 720P image-to-video first-frame async task.",
    followUpActionId: "jimeng_ai.get_video_generation_3_0_720p_result",
    inputSchema: imageToVideoFirstFrameInputSchema,
  }),
  submitAction({
    name: "submit_image_to_video_first_tail_frame_3_0_720p",
    operationType: "write",
    description: "Submit a Jimeng AI Video Generation 3.0 720P image-to-video first-and-last-frame async task.",
    followUpActionId: "jimeng_ai.get_video_generation_3_0_720p_result",
    inputSchema: imageToVideoFirstTailFrameInputSchema,
  }),
  submitAction({
    name: "submit_image_to_video_first_frame_3_0_1080p",
    operationType: "write",
    description: "Submit a Jimeng AI Video Generation 3.0 1080P image-to-video first-frame async task.",
    followUpActionId: "jimeng_ai.get_video_generation_3_0_1080p_result",
    inputSchema: imageToVideoFirstFrameInputSchema,
  }),
  submitAction({
    name: "submit_image_to_video_first_tail_frame_3_0_1080p",
    operationType: "write",
    description: "Submit a Jimeng AI Video Generation 3.0 1080P image-to-video first-and-last-frame async task.",
    followUpActionId: "jimeng_ai.get_video_generation_3_0_1080p_result",
    inputSchema: imageToVideoFirstTailFrameInputSchema,
  }),
  submitAction({
    name: "submit_smart_video_agent_1_0",
    operationType: "write",
    description: "Submit a Lilinque Smart Video Agent 1.0 async task.",
    followUpActionId: "jimeng_ai.get_smart_video_agent_1_0_result",
    inputSchema: smartVideoAgent10InputSchema,
  }),
  getResultAction({
    name: "get_smart_video_agent_1_0_result",
    operationType: "read",
    description: "Get the result of a Lilinque Smart Video Agent 1.0 async task.",
    inputSchema: videoGetResultInputSchema,
    outputSchema: videoResultOutputSchema,
  }),
  submitAction({
    name: "submit_smart_video_agent_2_0_with_reference",
    operationType: "write",
    description: "Submit a Lilinque Smart Video Agent 2.0 async task with reference videos.",
    followUpActionId: "jimeng_ai.get_smart_video_agent_2_0_with_reference_result",
    inputSchema: smartVideoAgent20WithReferenceInputSchema,
  }),
  getResultAction({
    name: "get_smart_video_agent_2_0_with_reference_result",
    operationType: "read",
    description: "Get the result of a Lilinque Smart Video Agent 2.0 async task with reference videos.",
    inputSchema: videoGetResultInputSchema,
    outputSchema: videoResultOutputSchema,
  }),
  submitAction({
    name: "submit_smart_video_agent_2_0_without_reference",
    operationType: "write",
    description: "Submit a Lilinque Smart Video Agent 2.0 async task without reference videos.",
    followUpActionId: "jimeng_ai.get_smart_video_agent_2_0_without_reference_result",
    inputSchema: smartVideoAgent20WithoutReferenceInputSchema,
  }),
  getResultAction({
    name: "get_smart_video_agent_2_0_without_reference_result",
    operationType: "read",
    description: "Get the result of a Lilinque Smart Video Agent 2.0 async task without reference videos.",
    inputSchema: videoGetResultInputSchema,
    outputSchema: videoResultOutputSchema,
  }),
  submitAction({
    name: "submit_marketing_video_agent",
    operationType: "write",
    description: "Submit a Lilinque Marketing Video Agent async task.",
    followUpActionId: "jimeng_ai.get_marketing_video_agent_result",
    inputSchema: marketingVideoAgentInputSchema,
  }),
  getResultAction({
    name: "get_marketing_video_agent_result",
    operationType: "read",
    description: "Get the result of a Lilinque Marketing Video Agent async task.",
    inputSchema: videoGetResultInputSchema,
    outputSchema: videoResultOutputSchema,
  }),
];
