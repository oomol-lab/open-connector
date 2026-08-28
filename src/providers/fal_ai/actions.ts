import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fal_ai";

const falObject = s.record(s.unknown("A raw fal property value."), {
  description: "The raw fal object payload.",
});
const falObjectArray = s.array("The list of raw fal objects.", falObject);
const falStringOrStringArray = s.anyOf("A single string or a list of strings.", [
  s.string("A single string value."),
  s.array("The list of strings.", s.string("A string value in the list.")),
]);
const falLogEntrySchema = s.object("A queue log entry.", {
  message: s.string("The log message text."),
  level: s.string("The log severity level."),
  source: s.string("The log source identifier."),
  timestamp: s.string("The log timestamp in ISO 8601 format."),
});

export const falAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_models",
    description:
      "Discover fal model endpoints with optional text search, status, category, pagination, endpoint filtering, and response expansion.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        q: s.string("The free-text search query for model discovery."),
        limit: s.integer("The maximum number of models to return.", { minimum: 1 }),
        cursor: s.string("The pagination cursor from a previous response."),
        expand: falStringOrStringArray,
        status: s.stringEnum("Filter models by active or deprecated status.", ["active", "deprecated"]),
        category: s.string("Filter models by category name."),
        endpointId: falStringOrStringArray,
      },
      {
        optional: ["q", "limit", "cursor", "expand", "status", "category", "endpointId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        models: falObjectArray,
        hasMore: s.boolean("Whether additional result pages are available."),
        nextCursor: s.nullable(s.string("The pagination cursor for the next page of results.")),
      },
      {
        required: ["models", "hasMore", "nextCursor"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_pricing",
    description:
      "Retrieve unit pricing information for one or more fal model endpoints, including billing unit and currency.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        endpointId: falStringOrStringArray,
      },
      {
        required: ["endpointId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        prices: falObjectArray,
        hasMore: s.boolean("Whether additional result pages are available."),
        nextCursor: s.nullable(s.string("The pagination cursor for the next page of pricing results.")),
      },
      {
        required: ["prices", "hasMore", "nextCursor"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "estimate_pricing",
    description:
      "Estimate total fal model cost using either historical API call quantities or expected billing-unit quantities.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        estimateType: s.stringEnum("The pricing estimation method to use.", ["historical_api_price", "unit_price"]),
        endpoints: falObject,
      },
      {
        required: ["estimateType", "endpoints"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        estimateType: s.string("The estimation method that was applied."),
        totalCost: s.number("The aggregate estimated cost across all endpoints."),
        currency: s.string("The ISO 4217 currency code for the estimate."),
      },
      {
        required: ["estimateType", "totalCost", "currency"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_jwks",
    description: "Retrieve the fal JSON Web Key Set used for webhook signature verification.",
    inputSchema: s.object("The input payload for this action.", {}),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        keys: falObjectArray,
      },
      {
        required: ["keys"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "submit_queue_request",
    description:
      "Submit a job to a fal model endpoint's async queue (e.g. an image or video generation model) and return immediately with a request ID plus the status/response/cancel URLs used to track it. This is how fal.ai job generation starts; follow up with queue_get_status and get_queue_request_result to retrieve the output.",
    followUpActions: ["fal_ai.queue_get_status", "fal_ai.get_queue_request_result", "fal_ai.cancel_queue_request"],
    asyncLifecycle: {
      startActionId: "fal_ai.submit_queue_request",
      statusActionId: "fal_ai.queue_get_status",
      cancelActionId: "fal_ai.cancel_queue_request",
    },
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format, such as fal-ai/flux/schnell."),
        input: s.record(s.unknown("A raw model input property value."), {
          description: "The model-specific input payload, such as { prompt: '...' } for a text-to-image model.",
        }),
        webhookUrl: s.string("An optional URL fal calls with the final result once the job completes."),
      },
      {
        required: ["modelId", "input"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        requestId: s.string("The submitted queue request identifier."),
        status: s.string("The initial queue status, typically IN_QUEUE."),
        queuePosition: s.nullable(s.integer("The current queue position when the request is still queued.")),
        statusUrl: s.string("The exact URL to poll for this request's status. Pass this to queue_get_status."),
        responseUrl: s.string("The exact URL to fetch this request's result. Pass this to get_queue_request_result."),
        cancelUrl: s.string("The exact URL to cancel this request. Pass this to cancel_queue_request."),
      },
      {
        required: ["requestId", "status", "statusUrl", "responseUrl", "cancelUrl"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "queue_get_status",
    description:
      "Check the status of a queued fal request, with optional log retrieval for in-progress or completed work. Model IDs with more than one path segment (most models) are queued under a shorter base application path, so pass the statusUrl returned by submit_queue_request when you have it instead of relying on modelId reconstruction.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format."),
        requestId: s.string("The queued request identifier."),
        statusUrl: s.string(
          "The exact status URL returned by submit_queue_request. When provided, this is used instead of reconstructing the URL from modelId and requestId.",
        ),
        logs: s.integer("Set to 1 to include logs in the response.", { minimum: 0, maximum: 1 }),
      },
      {
        optional: ["statusUrl", "logs"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        status: s.string("The current queue status."),
        responseUrl: s.nullable(s.string("The URL for fetching the final queued response.")),
        queuePosition: s.nullable(s.integer("The current queue position when the request is still queued.")),
        logs: s.array("The queue processing logs.", falLogEntrySchema),
      },
      {
        required: ["status"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "queue_get_status_stream",
    description:
      "Consume fal queue status updates as a streamed sequence of SSE events until the server closes the stream. Model IDs with more than one path segment (most models) are queued under a shorter base application path, so pass the statusUrl returned by submit_queue_request when you have it instead of relying on modelId reconstruction.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format."),
        requestId: s.string("The queued request identifier."),
        statusUrl: s.string(
          "The exact status URL returned by submit_queue_request. When provided, this is used instead of reconstructing the URL from modelId and requestId.",
        ),
        logs: s.integer("Set to 1 to include logs inside streamed updates.", {
          minimum: 0,
          maximum: 1,
        }),
      },
      {
        optional: ["statusUrl", "logs"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        updates: falObjectArray,
        finalStatus: s.nullable(s.string("The last status value seen in the stream.")),
        responseUrl: s.nullable(s.string("The final response URL seen in the stream, if present.")),
      },
      {
        required: ["updates"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_queue_request_result",
    description:
      "Retrieve the stored final result payload for a completed fal queued request. Model IDs with more than one path segment (most models) are queued under a shorter base application path, so pass the responseUrl returned by submit_queue_request when you have it instead of relying on modelId reconstruction.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format."),
        requestId: s.string("The queued request identifier."),
        responseUrl: s.string(
          "The exact response URL returned by submit_queue_request. When provided, this is used instead of reconstructing the URL from modelId and requestId.",
        ),
      },
      {
        required: ["modelId", "requestId"],
        optional: ["responseUrl"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        status: s.string("The request status, always COMPLETED since fal returns the model output directly."),
        response: falObject,
      },
      {
        required: ["status", "response"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "cancel_queue_request",
    description:
      "Request cancellation of a queued or in-progress fal request by model ID and request ID. Model IDs with more than one path segment (most models) are queued under a shorter base application path, so pass the cancelUrl returned by submit_queue_request when you have it instead of relying on modelId reconstruction.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format."),
        requestId: s.string("The queued request identifier."),
        cancelUrl: s.string(
          "The exact cancel URL returned by submit_queue_request. When provided, this is used instead of reconstructing the URL from modelId and requestId.",
        ),
      },
      {
        required: ["modelId", "requestId"],
        optional: ["cancelUrl"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        status: s.string("The cancellation result status."),
      },
      {
        required: ["status"],
      },
    ),
  }),
];
