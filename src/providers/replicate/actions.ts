import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "replicate";
const emptyInputSchema = s.object("No input parameters are required.", {});
const loosePayloadSchema = s.looseObject("A Replicate API object.");
const nullableUrlSchema = s.nullable(s.url("A Replicate pagination URL."));
const pageOutputFields = {
  next: nullableUrlSchema,
  previous: nullableUrlSchema,
};
const modelInputSchema = s.object("Input for selecting a Replicate model.", {
  owner: s.nonEmptyString("The Replicate model owner username or organization slug."),
  model: s.nonEmptyString("The Replicate model name slug."),
});
const modelVersionInputSchema = s.object("Input for selecting a Replicate model version.", {
  owner: s.nonEmptyString("The Replicate model owner username or organization slug."),
  model: s.nonEmptyString("The Replicate model name slug."),
  versionId: s.nonEmptyString("The Replicate model version identifier."),
});
const predictionInputSchema = s.object("Input for selecting a Replicate prediction.", {
  predictionId: s.nonEmptyString("The Replicate prediction identifier."),
});
const jsonObjectSchema: JsonSchema = s.looseObject("A JSON-serializable model input object.");

export const replicateActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve the authenticated Replicate account for the connected API token.",
    inputSchema: emptyInputSchema,
    outputSchema: s.looseRequiredObject("The authenticated Replicate account response.", {
      account: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_models",
    description: "List public Replicate models with optional official sorting parameters.",
    inputSchema: s.object(
      "Input for listing public Replicate models.",
      {
        sortBy: s.stringEnum("The field used to sort public Replicate models.", [
          "model_created_at",
          "latest_version_created_at",
        ]),
        sortDirection: s.stringEnum("The sort direction for Replicate model results.", ["asc", "desc"]),
      },
      { optional: ["sortBy", "sortDirection"] },
    ),
    outputSchema: s.looseRequiredObject("A paginated list of Replicate models.", {
      models: s.array("The Replicate models returned for this page.", loosePayloadSchema),
      ...pageOutputFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_model",
    description: "Retrieve one Replicate model by owner and model slug.",
    inputSchema: modelInputSchema,
    outputSchema: s.looseRequiredObject("A Replicate model response.", { model: loosePayloadSchema }),
  }),
  defineProviderAction(service, {
    name: "list_model_versions",
    description: "List versions for one Replicate model.",
    inputSchema: modelInputSchema,
    outputSchema: s.looseRequiredObject("A paginated list of Replicate model versions.", {
      versions: s.array("The model versions returned for this page.", loosePayloadSchema),
      ...pageOutputFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_model_version",
    description: "Retrieve one Replicate model version by owner, model, and version ID.",
    inputSchema: modelVersionInputSchema,
    outputSchema: s.looseRequiredObject("A Replicate model version response.", { version: loosePayloadSchema }),
  }),
  defineProviderAction(service, {
    name: "list_collections",
    description: "List public Replicate model collections.",
    inputSchema: emptyInputSchema,
    outputSchema: s.looseRequiredObject("A paginated list of Replicate collections.", {
      collections: s.array("The Replicate collections returned for this page.", loosePayloadSchema),
      ...pageOutputFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    description: "Retrieve one Replicate collection by slug.",
    inputSchema: s.object("Input for selecting a Replicate collection.", {
      collectionSlug: s.nonEmptyString("The Replicate collection slug."),
    }),
    outputSchema: s.looseRequiredObject("A Replicate collection response.", { collection: loosePayloadSchema }),
  }),
  defineProviderAction(service, {
    name: "create_prediction",
    description: "Create a Replicate prediction using JSON model input and optional synchronous wait headers.",
    inputSchema: s.object(
      "Input for creating a Replicate prediction from a model or model version.",
      {
        version: s.nonEmptyString(
          "The Replicate model identifier, model version identifier, or owner/model:version reference.",
        ),
        input: jsonObjectSchema,
        waitSeconds: s.integer("Seconds to wait synchronously for prediction output.", { minimum: 1, maximum: 60 }),
        cancelAfter: s.nonEmptyString(
          "Maximum prediction runtime before Replicate cancels it, such as 30s, 5m, or 1h30m.",
        ),
        webhook: s.url("An HTTPS webhook URL for Replicate prediction events."),
        webhookEventsFilter: s.array(
          "The Replicate prediction event types that should trigger the webhook.",
          s.stringEnum("One Replicate webhook event filter.", ["start", "output", "logs", "completed"]),
          { minItems: 1 },
        ),
      },
      { optional: ["waitSeconds", "cancelAfter", "webhook", "webhookEventsFilter"] },
    ),
    outputSchema: s.looseRequiredObject("A Replicate prediction response.", { prediction: loosePayloadSchema }),
  }),
  defineProviderAction(service, {
    name: "get_prediction",
    description: "Retrieve the current state and output of a Replicate prediction.",
    inputSchema: predictionInputSchema,
    outputSchema: s.looseRequiredObject("A Replicate prediction response.", { prediction: loosePayloadSchema }),
  }),
  defineProviderAction(service, {
    name: "list_predictions",
    description: "List Replicate predictions for the authenticated account.",
    inputSchema: s.object(
      "Input for filtering Replicate predictions.",
      {
        createdAfter: s.dateTime("Include predictions created at or after this ISO 8601 timestamp."),
        createdBefore: s.dateTime("Include predictions created before this ISO 8601 timestamp."),
        source: s.literal("web", { description: "Filter predictions to those created from the Replicate website." }),
      },
      { optional: ["createdAfter", "createdBefore", "source"] },
    ),
    outputSchema: s.looseRequiredObject("A paginated list of Replicate predictions.", {
      predictions: s.array("The Replicate predictions returned for this page.", loosePayloadSchema),
      ...pageOutputFields,
    }),
  }),
  defineProviderAction(service, {
    name: "cancel_prediction",
    description: "Cancel a running Replicate prediction by prediction ID.",
    inputSchema: predictionInputSchema,
    outputSchema: s.looseRequiredObject("A Replicate prediction response after cancellation.", {
      prediction: loosePayloadSchema,
    }),
  }),
];
