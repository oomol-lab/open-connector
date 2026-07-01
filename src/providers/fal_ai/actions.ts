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
    name: "queue_get_status",
    description:
      "Check the status of a queued fal request, with optional log retrieval for in-progress or completed work.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format."),
        requestId: s.string("The queued request identifier."),
        logs: s.integer("Set to 1 to include logs in the response.", { minimum: 0, maximum: 1 }),
      },
      {
        optional: ["logs"],
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
      "Consume fal queue status updates as a streamed sequence of SSE events until the server closes the stream.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format."),
        requestId: s.string("The queued request identifier."),
        logs: s.integer("Set to 1 to include logs inside streamed updates.", {
          minimum: 0,
          maximum: 1,
        }),
      },
      {
        optional: ["logs"],
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
    description: "Retrieve the stored final result payload for a completed fal queued request.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format."),
        requestId: s.string("The queued request identifier."),
      },
      {
        required: ["modelId", "requestId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        status: s.string("The final request status returned by the queue API."),
        logs: s.array("The logs captured for the queued request.", falLogEntrySchema),
        response: falObject,
      },
      {
        required: ["status", "logs", "response"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "cancel_queue_request",
    description: "Request cancellation of a queued or in-progress fal request by model ID and request ID.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        modelId: s.string("The model identifier in namespace/name format."),
        requestId: s.string("The queued request identifier."),
      },
      {
        required: ["modelId", "requestId"],
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

export type FalAiActionName =
  | "get_models"
  | "get_pricing"
  | "estimate_pricing"
  | "get_jwks"
  | "queue_get_status"
  | "queue_get_status_stream"
  | "get_queue_request_result"
  | "cancel_queue_request";
