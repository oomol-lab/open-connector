import type { ActionDefinition } from "../../core/types.ts";

import { readSchemaProperties, jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { estimates, imageHandle, requestId, videoHandle, videoInput } from "./schemas.ts";

const ack = s.object(
  "Operation acknowledgement.",
  {
    accepted: s.boolean("Whether the operation was accepted."),
    message: s.string("Provider message."),
  },
  {
    additionalProperties: true,
    optional: ["message"],
  },
);

const download = s.looseObject("Temporary download information.", {
  url: s.url("Presigned download URL."),
  expiresAt: s.integer("URL expiration in Unix milliseconds."),
  expiresIn: s.integer("URL lifetime in milliseconds."),
});

const record = s.looseObject("Full video request record, including corrected source metrics and credit transactions.", {
  id: s.string("Video request ID."),
  status: s.string("Video request state."),
  source: s.looseObject("Source video details and download.", { download }),
  destination: s.looseObject("Output video details and download.", { download }),
  filters: s.array("Requested model filters.", s.looseObject("Model filter parameters.")),
  output: s.looseObject("Requested encoding settings."),
  estimates,
  transactions: s.array(
    "Credit transactions.",
    s.looseObject("Credit transaction.", {
      operation: s.string("Transaction operation."),
      amount: s.number("Transaction amount in credits."),
    }),
  ),
  error: s.looseObject("Processing failure details.", {
    message: s.string("Failure message."),
    errorCode: s.string("Pipeline failure code."),
  }),
});

const imageEstimate = s.object(
  "Image processing estimate parameters; this does not start a job.",
  {
    category: s.stringEnum("Image model category.", [
      "Enhance",
      "Sharpen",
      "Denoise",
      "Restore",
      "Lighting",
      "Matting",
      "Tool",
    ]),
    model: s.string("Official model name for the selected category."),
    input_height: s.integer("Input height in pixels.", { minimum: 1, maximum: 32000 }),
    input_width: s.integer("Input width in pixels.", { minimum: 1, maximum: 32000 }),
    output_height: s.integer("Output height in pixels; applies to Enhance and Tool.", {
      minimum: 1,
      maximum: 32000,
    }),
    output_width: s.integer("Output width in pixels; applies to Enhance and Tool.", {
      minimum: 1,
      maximum: 32000,
    }),
    crop_to_fill: s.boolean("Crop to fill rather than letterbox."),
    output_format: s.stringEnum("Desired image format.", ["jpeg", "jpg", "png", "tiff", "tif"]),
    modelSettings: s.record(
      "Official model-specific settings; cannot override common estimate fields.",
      s.string("Model parameter value."),
    ),
  },
  {
    optional: ["category", "model", "output_height", "output_width", "crop_to_fill", "output_format", "modelSettings"],
  },
);

const estimateResult = s.looseObject("Estimated image processing cost and duration.", {
  duration: s.number("Estimated processing duration in seconds."),
  credits: s.number("Estimated credit cost."),
});

const createVideoInput = s.object(
  "Create a video request and obtain estimates without charging credits or starting processing. Accept the request after reviewing the estimate.",
  {
    ...readSchemaProperties(videoInput),
    source: s.object(
      "Source metadata for the standard video workflow.",
      {
        container: readSchemaProperties(readSchemaProperties(videoInput).source).container,
        size: s.integer("Source file size in bytes, strictly below 100 GB.", {
          minimum: 1,
          exclusiveMaximum: 100000000000,
        }),
        duration: s.number("Source duration in seconds."),
        frameCount: s.number("Source frame count."),
        frameRate: s.number("Source frame rate."),
        resolution: {
          ...readSchemaProperties(readSchemaProperties(videoInput).output).resolution,
          description: "Source video resolution.",
        },
        external: readSchemaProperties(readSchemaProperties(videoInput).source).external,
      },
      {
        optional: ["external"],
      },
    ),
    output: {
      ...readSchemaProperties(videoInput).output,
      description: "Standard video output settings; resolution, frameRate and audioTransfer are required.",
      required: ["resolution", "frameRate", "audioTransfer"],
    },
  },
  {
    optional: ["destination", "notifications"],
  },
);

interface Endpoint {
  name: string;
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  mode?: "query" | "estimate" | "bulk" | "ack" | "imageList";
  definition: Omit<Parameters<typeof defineProviderAction>[1], "service" | "name" | "requiredScopes">;
}

const endpoints: Endpoint[] = [
  {
    name: "list_image_jobs",
    path: "/image/v1/status",
    method: "GET",
    mode: "imageList",
    definition: {
      operationType: "read",
      description:
        "List image jobs. Pagination defaults to true; non-paginated mode returns jobs up to seven days old. Follow next_cursor while has_next_page is true.",
      inputSchema: s.object(
        "Image job listing options.",
        {
          paginated: s.boolean("Enable pagination. Defaults to true."),
          limit: s.integer("Page size when paginated; maximum 100.", { minimum: 1, maximum: 100 }),
          cursor: s.string("Cursor from the previous page."),
        },
        {
          optional: ["paginated", "limit", "cursor"],
        },
      ),
      outputSchema: s.object(
        "Normalized image job list.",
        {
          data: s.array("Image job records.", s.looseObject("Image job status and metadata.")),
          pagination: s.looseObject("Pagination details.", {
            next_cursor: s.string("Next page cursor."),
            has_next_page: s.boolean("Whether more pages exist."),
          }),
        },
        {
          additionalProperties: true,
          optional: ["pagination"],
        },
      ),
    },
  },
  {
    name: "delete_image_job_status",
    path: "/image/v1/status/{processId}",
    method: "DELETE",
    mode: "ack",
    definition: {
      operationType: "destructive",
      description: "Delete one image job status record. This is separate from cancelling a running job.",
      inputSchema: imageHandle,
      outputSchema: ack,
    },
  },
  {
    name: "delete_all_image_job_statuses",
    path: "/image/v1/status",
    method: "DELETE",
    definition: {
      operationType: "destructive",
      description: "Delete all image processing status records, clearing the account's job history.",
      inputSchema: s.requiredObject("Delete all image statuses request.", {}),
      outputSchema: s.looseObject("Deleted image status count.", {
        deleted_count: s.integer("Number of deleted status records."),
      }),
    },
  },
  {
    name: "get_image_input_download",
    path: "/image/v1/download/input/{processId}",
    method: "GET",
    definition: {
      operationType: "read",
      description: "Get temporary download and HEAD links for the original input image.",
      inputSchema: imageHandle,
      outputSchema: s.looseObject("Original image download links.", {
        download_url: s.url("Presigned original image download URL."),
        head_url: s.url("Presigned original image HEAD URL."),
        expiry: s.integer("URL expiry in Unix seconds."),
      }),
    },
  },
  ...([false, true] as const).map((generative): Endpoint => ({
    name: generative ? "estimate_generative_image" : "estimate_image",
    path: generative ? "/image/v1/estimate-gen" : "/image/v1/estimate",
    method: "POST",
    mode: "estimate",
    definition: {
      operationType: "read",
      description: generative
        ? "Estimate generative image processing credits and duration without submitting a job."
        : "Estimate standard image processing credits and duration without submitting a job.",
      inputSchema: imageEstimate,
      outputSchema: estimateResult,
    },
  })),
  {
    name: "estimate_images_bulk",
    path: "/image/v1/estimate-bulk",
    method: "POST",
    mode: "bulk",
    definition: {
      operationType: "read",
      description: "Estimate multiple image jobs in one request. Each result may succeed or contain its own error.",
      inputSchema: s.requiredObject("Bulk image estimate request.", {
        requests: s.array("Image estimate requests in order.", {
          ...imageEstimate,
          properties: {
            ...readSchemaProperties(imageEstimate),
            category: s.stringEnum("Bulk estimate model category.", [
              "Enhance",
              "Sharpen",
              "Denoise",
              "Restore",
              "Lighting",
            ]),
          },
        }),
      }),
      outputSchema: s.requiredObject("Bulk estimates in request order.", {
        results: s.array(
          "Per-request estimate results.",
          s.looseObject("An estimate or per-item failure.", {
            ...readSchemaProperties(estimateResult),
            status: s.string("Per-item success or error status."),
            code: s.integer("Per-item error code."),
            message: s.string("Per-item error message."),
          }),
        ),
      }),
    },
  },
  {
    name: "get_video_system_status",
    path: "/video/status",
    method: "GET",
    definition: {
      operationType: "read",
      description: "Get video service availability and the authoritative list of currently supported model codes.",
      inputSchema: s.requiredObject("Video system status request.", {}),
      outputSchema: s.looseObject("Video service capabilities.", {
        isAvailable: s.boolean("Whether the service is available."),
        availabilityMessage: s.string("Service availability message."),
        supportedModels: s.array("Currently accepted model codes.", s.string("Video model code.")),
        isFrameInterpolationSupported: s.boolean("Whether frame interpolation is supported."),
      }),
    },
  },
  {
    name: "create_video_request",
    path: "/video/",
    method: "POST",
    definition: {
      operationType: "write",
      description:
        "Create a standard video request and receive cost estimates. No credits are charged and processing does not start until accept_video_request. Prefer submit_video_enhancement for automatic external-source processing.",
      inputSchema: createVideoInput,
      outputSchema: s.object(
        "Created video request and estimates.",
        { requestId: s.string("Created video request ID."), estimates },
        {
          additionalProperties: true,
          optional: ["estimates"],
        },
      ),
      followUpActions: ["topaz.accept_video_request"],
    },
  },
  {
    name: "accept_video_request",
    path: "/video/{requestId}/accept",
    method: "PATCH",
    definition: {
      operationType: "write",
      description:
        "Accept estimated video costs and reserve credits. External sources start processing automatically. Otherwise PUT source bytes to the returned upload URLs and call complete_video_upload; repeated calls return the same URLs.",
      inputSchema: videoHandle,
      outputSchema: s.looseObject("Accepted video request and optional upload targets.", {
        uploadId: s.string("Multipart upload ID."),
        urls: s.array("Presigned source upload URLs.", s.url("Presigned upload URL.")),
        message: s.string("External source processing message."),
      }),
      followUpActions: ["topaz.get_video_job", "topaz.complete_video_upload"],
    },
  },
  {
    name: "complete_video_upload",
    path: "/video/{requestId}/complete-upload/",
    method: "PATCH",
    definition: {
      operationType: "write",
      description:
        "Complete an externally performed video upload and start processing. For one upload URL send [{partNum:1,eTag:unused}]; multipart uploads require the actual ordered part numbers and ETags returned by storage.",
      inputSchema: s.object(
        "Upload completion request.",
        {
          requestId,
          md5Hash: s.string("Optional source file MD5 hash."),
          uploadResults: s.array(
            "Uploaded parts and ETags.",
            s.requiredObject("One uploaded part.", {
              partNum: s.integer("One-based part number.", { minimum: 1 }),
              eTag: s.string("ETag returned by the storage PUT, or unused for single-URL uploads.", { minLength: 1 }),
            }),
            { minItems: 1 },
          ),
        },
        {
          optional: ["md5Hash"],
        },
      ),
      outputSchema: s.looseObject("Upload completion response.", {
        message: s.string("Upload completion message."),
      }),
      followUpActions: ["topaz.get_video_job"],
    },
  },
  {
    name: "estimate_video_cancellation",
    path: "/video/{requestId}/cancel-estimate",
    method: "GET",
    definition: {
      operationType: "read",
      description:
        "Preview credits committed and refunded if a video request were cancelled now, without cancelling it.",
      inputSchema: videoHandle,
      outputSchema: s.looseObject("Video cancellation settlement estimate.", {
        requestId: s.string("Video request ID."),
        status: s.string("Current processing state."),
        cancelable: s.boolean("Whether cancellation is still possible."),
        progress: s.number("Progress used for settlement, percent."),
        creditsReserved: s.number("Currently reserved credits."),
        creditsToCommit: s.number("Credits charged if cancelled now."),
        creditsToRefund: s.number("Credits refunded if cancelled now."),
        message: s.string("Settlement summary."),
      }),
    },
  },
  {
    name: "delete_video_files",
    path: "/video/{requestId}/media",
    method: "DELETE",
    mode: "ack",
    definition: {
      operationType: "destructive",
      description: "Permanently delete the source and enhanced video files stored by Topaz for a request.",
      inputSchema: videoHandle,
      outputSchema: ack,
    },
  },
  {
    name: "get_video_request",
    path: "/video/{requestId}",
    method: "GET",
    definition: {
      operationType: "read",
      description:
        "Get the full video request record, including unaccepted requests, corrected source metrics, credit transactions and signed downloads.",
      inputSchema: videoHandle,
      outputSchema: record,
    },
  },
  {
    name: "get_video_metrics",
    path: "/video/{requestId}/metrics",
    method: "GET",
    definition: {
      operationType: "read",
      description:
        "Get video processing metrics. Requests without chunked processing may return only a message indicating metrics are unavailable.",
      inputSchema: videoHandle,
      outputSchema: s.looseObject("Video request processing metrics.", {
        message: s.string("Reason metrics are unavailable."),
        minutesInState: s.record("Minutes spent in each processing state.", s.number("Minutes in the state.")),
        minutesToEnhance: s.number("Minutes from source upload to completed output."),
        inputFrames: s.integer("Input frame count."),
        outputFrames: s.integer("Output frame count."),
        inputSize: s.string("Input file size."),
        outputSize: s.string("Output file size."),
        chunks: s.array(
          "Per-chunk metrics.",
          s.looseObject("Chunk processing metrics.", {
            chunkIndex: s.integer("Chunk index."),
            tasks: s.array(
              "Per-task metrics.",
              s.looseObject("Task processing speed, GPU utilization, frame counts and file sizes."),
            ),
          }),
        ),
      }),
    },
  },
  {
    name: "list_video_requests",
    path: "/video/history",
    method: "GET",
    mode: "query",
    definition: {
      operationType: "read",
      description:
        "List accepted video requests newest first. Follow nextCursor until null, even when a page has fewer than 50 entries. Unaccepted requests are omitted.",
      inputSchema: s.object(
        "Video history page request.",
        { cursor: s.string("Opaque cursor from the previous page.") },
        {
          optional: ["cursor"],
        },
      ),
      outputSchema: s.looseObject("Video request history page.", {
        result: s.array("Video request records.", record),
        nextCursor: s.nullableString("Next page cursor, or null at the end."),
      }),
    },
  },
  {
    name: "get_credit_usage",
    path: "/account/v1/credit-usage",
    method: "GET",
    mode: "query",
    definition: {
      operationType: "read",
      description:
        "Get historical API credit consumption by time bucket. Explicit date ranges override period. period=1d covers 48 hours; sparse buckets do not imply missing requests.",
      inputSchema: s.object(
        "Credit usage filters.",
        {
          period: s.stringEnum("Relative period; 1d actually covers 48 hours.", ["1d", "7d", "30d"]),
          start_date: s.string("Inclusive UTC start date.", { format: "date" }),
          end_date: s.string("Inclusive UTC end date, on or after start_date.", { format: "date" }),
          granularity: s.stringEnum("Bucket size, honored only for explicit date ranges.", [
            "hour",
            "day",
            "3day",
            "week",
            "month",
          ]),
          models: s.array("Restrict to these models; encoded as repeated query parameters.", s.string("Model name.")),
          api_key_id: s.string("Filter by API key ID, not the secret API key."),
          group_by: s.stringEnum("Optional breakdown dimension.", ["models", "api_key_id"]),
        },
        {
          optional: ["period", "start_date", "end_date", "granularity", "models", "api_key_id", "group_by"],
          anyOf: [{ required: ["period"] }, { required: ["start_date", "end_date"] }],
          dependentRequired: { start_date: ["end_date"], end_date: ["start_date"] },
        },
      ),
      outputSchema: s.looseObject("Historical credit usage.", {
        period: s.nullableString("Requested relative period."),
        granularity: s.string("Returned bucket size."),
        start_date: s.nullableString("Resolved start date."),
        end_date: s.nullableString("Resolved end date."),
        group_by: s.nullableString("Requested grouping."),
        total_credits: s.number("Credits consumed in the window; may be fractional."),
        total_requests: s.number("Requests in the window."),
        usage: s.array(
          "Sparse time buckets in ascending order.",
          s.looseObject("One credit usage bucket.", {
            period_start: s.string("UTC bucket start time."),
            credits: s.number("Credits consumed in this bucket."),
            groups: s.array(
              "Optional per-group breakdown.",
              s.looseObject("Group credit usage.", {
                key: s.string("Model name or API key ID."),
                credits: s.number("Credits consumed by this group."),
              }),
            ),
          }),
        ),
      }),
    },
  },
];

export const additionalEndpointByName: Map<string, Endpoint> = new Map(
  endpoints.map((endpoint) => [endpoint.name, endpoint]),
);

export const additionalActions: ActionDefinition[] = endpoints.map(({ name, definition }) =>
  defineProviderAction("topaz", {
    name,
    requiredScopes: [],
    ...definition,
  }),
);
