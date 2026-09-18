import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "apiframe";

const webhookEventSchema = s.stringEnum("An Apiframe job event delivered to the webhook.", [
  "progress",
  "completed",
  "failed",
]);

const generationBodySchema = s.looseRequiredObject(
  "The Apiframe generation request, including the model-specific parameter object documented for the selected model.",
  {
    model: s.nonEmptyString("The Apiframe model identifier from the model catalog."),
    prompt: s.nonEmptyString("The generation prompt when required by the selected model."),
    webhookUrl: s.url("The endpoint URL that receives job events."),
    webhookEvents: s.array("The job events delivered to the webhook.", webhookEventSchema, {
      minItems: 1,
    }),
  },
  { optional: ["prompt", "webhookUrl", "webhookEvents"] },
);

const jobAcceptedSchema = s.requiredObject("The accepted Apiframe generation job.", {
  jobId: s.string("The job UUID used to retrieve the result.", { format: "uuid" }),
  status: s.stringEnum("The job status when the request was accepted.", [
    "QUEUED",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
  ]),
});

const jobSchema = s.looseRequiredObject(
  "The current Apiframe job state and result.",
  {
    id: s.string("The Apiframe job UUID.", { format: "uuid" }),
    status: s.stringEnum("The current job status.", ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]),
    model: s.string("The model used by the job."),
    progress: s.nullable(s.integer("The completion percentage when reported.", { minimum: 0, maximum: 100 })),
    input: s.nullable(s.looseObject("The original generation input when returned.")),
    result: s.unknown("The model-specific result, normally containing provider-hosted media URLs."),
    error: s.nullable(s.string("The failure message when the job failed.")),
    creditCost: s.nullable(s.integer("The number of credits charged for the job.")),
    webhookStatus: s.nullable(s.string("The current webhook delivery status.")),
    createdAt: s.string("The time the job was created.", { format: "date-time" }),
    completedAt: s.nullable(s.string("The time the job completed.", { format: "date-time" })),
    expired: s.boolean("Whether the job's hosted media assets have expired."),
  },
  { optional: ["input", "result", "expired"] },
);

function generationAction(name: "generate_image" | "generate_video" | "generate_music", noun: string) {
  return defineProviderAction(service, {
    name,
    operationType: "write",
    description: `Submit an Apiframe ${noun} generation job and return its job ID.`,
    followUpActions: ["apiframe.get_job"],
    inputSchema: s.object(
      `The request for an Apiframe ${noun} generation job.`,
      {
        body: generationBodySchema,
        idempotencyKey: s.nonEmptyString("A unique key used to deduplicate generation retries."),
      },
      { optional: ["idempotencyKey"] },
    ),
    outputSchema: jobAcceptedSchema,
  });
}

export const apiframeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_models",
    operationType: "read",
    description: "List Apiframe models and their current generation control surfaces.",
    inputSchema: s.object(
      "The optional modality filter for the Apiframe model catalog.",
      { modality: s.stringEnum("The media modality to return.", ["image", "video", "music"]) },
      { optional: ["modality"] },
    ),
    outputSchema: s.requiredObject("The current Apiframe model catalog.", {
      models: s.array(
        "The available Apiframe models.",
        s.looseObject("One model and its provider-defined control surface."),
      ),
    }),
  }),
  generationAction("generate_image", "image"),
  generationAction("generate_video", "video"),
  generationAction("generate_music", "music"),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Get the current status and model-specific result for one Apiframe job.",
    inputSchema: s.requiredObject("The Apiframe job to retrieve.", {
      id: s.string("The Apiframe job UUID.", { format: "uuid" }),
    }),
    outputSchema: jobSchema,
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    operationType: "read",
    description: "List Apiframe jobs with cursor pagination and optional status or model filters.",
    inputSchema: s.object(
      "The filters and pagination controls for listing Apiframe jobs.",
      {
        status: s.stringEnum("The job status to return.", ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]),
        model: s.nonEmptyString("The model identifier to return."),
        limit: s.integer("The maximum number of jobs to return.", { minimum: 1, maximum: 100 }),
        cursor: s.nonEmptyString("The cursor returned by the previous page."),
        scope: s.stringEnum("Whether to return the user's jobs or, for admins, all team jobs.", ["user", "team"]),
        search: s.string("A job UUID to search for.", { format: "uuid" }),
        includeModels: s.boolean("Whether to include model identifiers available to the current filter."),
      },
      { optional: ["status", "model", "limit", "cursor", "scope", "search", "includeModels"] },
    ),
    outputSchema: s.object(
      "A page of Apiframe jobs.",
      {
        jobs: s.array("The jobs in this page.", jobSchema),
        nextCursor: s.nullable(s.string("The cursor for the next page.")),
        hasMore: s.boolean("Whether another page is available."),
        models: s.array("Model identifiers available to the current filter.", s.string("One model identifier.")),
      },
      { optional: ["models"] },
    ),
  }),
];
