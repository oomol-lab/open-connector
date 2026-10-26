import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { additionalActions } from "./additional-actions.ts";
import { imageOperationInput, imageOperations } from "./image-operations.ts";
import { estimates, imageHandle, imageSubmission, videoHandle, videoInput } from "./schemas.ts";

export const topazActions: ActionDefinition[] = [
  ...additionalActions,
  ...imageOperations.map((operation) =>
    defineProviderAction("topaz", {
      name: operation.name,
      operationType: "write",
      requiredScopes: [],
      description: operation.description,
      inputSchema: imageOperationInput(operation),
      outputSchema: imageSubmission,
      asyncLifecycle: {
        startActionId: `topaz.${operation.name}`,
        statusActionId: "topaz.get_image_job",
        cancelActionId: "topaz.cancel_image_job",
      },
    }),
  ),
  defineProviderAction("topaz", {
    name: "get_image_job",
    operationType: "read",
    requiredScopes: [],
    description:
      "Get an image job status and progress. After completion use get_image_download to retrieve the result URL.",
    inputSchema: imageHandle,
    outputSchema: s.object(
      "Image job status and metadata.",
      {
        process_id: s.string("Image processing job ID."),
        status: s.string("Job status: Pending, Processing, Completed, Cancelled or Failed."),
        progress: s.number("Processing progress percentage."),
        eta: s.integer("Estimated completion time in Unix seconds."),
      },
      {
        additionalProperties: true,
        optional: ["process_id", "progress", "eta"],
      },
    ),
    followUpActions: ["topaz.get_image_download"],
  }),
  defineProviderAction("topaz", {
    name: "get_image_download",
    operationType: "read",
    requiredScopes: [],
    description: "Get a completed image's temporary download and HEAD URLs, valid for one hour.",
    inputSchema: imageHandle,
    outputSchema: s.object(
      "Temporary image download links.",
      {
        download_url: s.url("Presigned result download URL."),
        head_url: s.url("Presigned URL for a HEAD request."),
        expiry: s.integer("Link expiration time in Unix seconds."),
      },
      {
        additionalProperties: true,
        optional: ["head_url", "expiry"],
      },
    ),
  }),
  defineProviderAction("topaz", {
    name: "cancel_image_job",
    operationType: "destructive",
    requiredScopes: [],
    description: "Cancel a pending image job. Completed or non-cancellable jobs return a conflict.",
    inputSchema: imageHandle,
    outputSchema: s.requiredObject("Image cancellation acknowledgement.", {
      accepted: s.boolean("Whether cancellation was accepted."),
    }),
  }),
  defineProviderAction("topaz", {
    name: "submit_video_enhancement",
    operationType: "write",
    requiredScopes: [],
    description:
      "Submit video enhancement or frame interpolation through Express using S3 external storage. Topaz fetches the source and starts processing immediately. Preserve audio explicitly with audioTransfer and audioCodec.",
    inputSchema: videoInput,
    outputSchema: s.object(
      "Submitted video job.",
      { requestId: s.string("Video enhancement request ID."), estimates },
      {
        additionalProperties: true,
        optional: ["estimates"],
      },
    ),
    asyncLifecycle: {
      startActionId: "topaz.submit_video_enhancement",
      statusActionId: "topaz.get_video_job",
      cancelActionId: "topaz.cancel_video_job",
    },
  }),
  defineProviderAction("topaz", {
    name: "get_video_job",
    operationType: "read",
    requiredScopes: [],
    description:
      "Get video processing status, progress, estimates and the completed result download link. Download links are reused and expire after their original lifetime.",
    inputSchema: videoHandle,
    outputSchema: s.object(
      "Video processing status and result.",
      {
        status: s.string("Video job processing status."),
        progress: s.number("Processing progress percentage."),
        estimates,
        message: s.string("Processing message."),
        errorCode: s.string("Processing failure code."),
        download: s.looseObject("Completed video download.", {
          url: s.url("Presigned video download URL."),
          expiresIn: s.integer("Download link lifetime in milliseconds."),
          expiresAt: s.integer("Download expiration time in Unix milliseconds."),
        }),
      },
      {
        additionalProperties: true,
        optional: ["progress", "estimates", "message", "errorCode", "download"],
      },
    ),
  }),
  defineProviderAction("topaz", {
    name: "cancel_video_job",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Cancel a video job. Topaz may refund credits in full before processing or partially during processing.",
    inputSchema: videoHandle,
    outputSchema: s.object(
      "Video cancellation acknowledgement.",
      {
        accepted: s.boolean("Whether cancellation was accepted."),
        message: s.string("Cancellation and refund message."),
      },
      {
        additionalProperties: true,
        optional: ["message"],
      },
    ),
  }),
  defineProviderAction("topaz", {
    name: "get_credit_balance",
    operationType: "read",
    requiredScopes: [],
    description: "Get available, reserved and total Topaz API credits.",
    inputSchema: s.requiredObject("Credit balance request.", {}),
    outputSchema: s.looseObject("API credit balance.", {
      available_credits: s.number("Available credits."),
      reserved_credits: s.number("Reserved credits."),
      total_credits: s.number("Total credits."),
    }),
  }),
];
