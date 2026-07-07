import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "higgsfield_ai";

const requestStatusValues = ["queued", "in_progress", "nsfw", "failed", "completed"];

const modelIdSchema = s.nonEmptyString("The Higgsfield model identifier to call.");
const requestIdSchema = s.nonEmptyString("The Higgsfield request identifier returned by submit.");
const webhookUrlSchema = s.url("The public webhook URL that Higgsfield should notify.");
const argumentsSchema = s.looseObject("Additional model-specific Higgsfield request arguments.");

const imageResultSchema = s.actionOutput({ url: s.url("The generated image URL.") }, "One generated image result.");
const videoResultSchema = s.actionOutput({ url: s.url("The generated video URL.") }, "The generated video result.");
const generationOutputSchema = s.actionOutput(
  {
    status: s.stringEnum("The current Higgsfield request status.", requestStatusValues),
    requestId: requestIdSchema,
    statusUrl: s.nullable(s.url("The Higgsfield status URL for this request.")),
    cancelUrl: s.nullable(s.url("The Higgsfield cancel URL for this request.")),
    images: s.array("Generated image outputs when available.", imageResultSchema),
    video: s.nullable(videoResultSchema),
    error: s.nullableString("The Higgsfield error message when the request failed."),
    raw: s.looseObject("The raw Higgsfield response payload."),
  },
  "A Higgsfield generation request state.",
);

export const higgsfieldAiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_image_generation",
    description: "Submit a Higgsfield text-to-image generation request.",
    followUpActions: ["higgsfield_ai.get_request_status"],
    asyncLifecycle: {
      startActionId: "higgsfield_ai.submit_image_generation",
      statusActionId: "higgsfield_ai.get_request_status",
      cancelActionId: "higgsfield_ai.cancel_request",
      jobIdOutputPath: "requestId",
      jobIdInputField: "requestId",
      completionPath: "status",
      completionValues: { done: ["completed"], failed: ["failed", "nsfw"] },
    },
    inputSchema: s.actionInput(
      {
        prompt: s.nonEmptyString("The text prompt describing the image to generate."),
        modelId: modelIdSchema,
        aspectRatio: s.nonEmptyString("The image aspect ratio, such as 16:9."),
        resolution: s.nonEmptyString("The requested image resolution, such as 720p."),
        cameraFixed: s.boolean("Whether the model camera should remain fixed."),
        webhookUrl: webhookUrlSchema,
        arguments: argumentsSchema,
      },
      ["prompt"],
      "The Higgsfield text-to-image generation request.",
    ),
    outputSchema: generationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_video_generation",
    description: "Submit a Higgsfield image-to-video generation request.",
    followUpActions: ["higgsfield_ai.get_request_status"],
    asyncLifecycle: {
      startActionId: "higgsfield_ai.submit_video_generation",
      statusActionId: "higgsfield_ai.get_request_status",
      cancelActionId: "higgsfield_ai.cancel_request",
      jobIdOutputPath: "requestId",
      jobIdInputField: "requestId",
      completionPath: "status",
      completionValues: { done: ["completed"], failed: ["failed", "nsfw"] },
    },
    inputSchema: s.actionInput(
      {
        prompt: s.nonEmptyString("The motion prompt describing how the image should animate."),
        imageUrl: s.url("The publicly accessible source image URL."),
        modelId: modelIdSchema,
        duration: s.integer("The requested video duration in seconds.", { minimum: 1 }),
        webhookUrl: webhookUrlSchema,
        arguments: argumentsSchema,
      },
      ["prompt", "imageUrl"],
      "The Higgsfield image-to-video generation request.",
    ),
    outputSchema: generationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_request_status",
    description: "Retrieve the current status and outputs for a Higgsfield generation request.",
    inputSchema: s.actionInput({ requestId: requestIdSchema }, ["requestId"], "The Higgsfield request status lookup."),
    outputSchema: generationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_request",
    description: "Cancel a queued Higgsfield generation request.",
    inputSchema: s.actionInput(
      { requestId: requestIdSchema },
      ["requestId"],
      "The Higgsfield request cancellation input.",
    ),
    outputSchema: s.actionOutput(
      {
        requestId: requestIdSchema,
        accepted: s.boolean("Whether Higgsfield accepted the cancellation request."),
      },
      "The Higgsfield cancellation result.",
    ),
  }),
];

export type HiggsfieldAiActionName =
  | "submit_image_generation"
  | "submit_video_generation"
  | "get_request_status"
  | "cancel_request";
