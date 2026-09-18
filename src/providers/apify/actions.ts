import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "apify";

const apifyJsonValueSchema = s.unknown("A JSON-compatible Apify value.");

const apifyUserSchema = s.looseRequiredObject(
  "The current Apify user account.",
  {
    id: s.string("The Apify user identifier."),
    username: s.string("The Apify username."),
    email: s.string("The email address of the Apify user."),
    plan: s.looseObject("The Apify subscription plan."),
    proxy: s.looseObject("The Apify proxy configuration."),
  },
  { optional: ["id", "email", "plan", "proxy"] },
);

const apifyActorSchema = s.looseRequiredObject(
  "An Apify actor.",
  {
    id: s.string("The Apify actor identifier."),
    userId: s.string("The owner user identifier."),
    name: s.string("The internal actor name."),
    username: s.string("The actor owner's username."),
    title: s.string("The actor display title."),
    description: s.string("The actor description."),
    isPublic: s.boolean("Whether the actor is public."),
    createdAt: s.string("When the actor was created."),
    modifiedAt: s.string("When the actor was last modified."),
    stats: s.looseObject("Actor usage and popularity statistics."),
  },
  { optional: ["title", "description", "createdAt", "modifiedAt", "stats"] },
);

const apifyRunSchema = s.looseRequiredObject(
  "An Apify actor run.",
  {
    id: s.string("The Apify run identifier."),
    actId: s.string("The actor identifier associated with the run."),
    status: s.string("The current run status."),
    startedAt: s.string("When the run started."),
    finishedAt: s.string("When the run finished."),
    defaultDatasetId: s.string("The default dataset identifier created for the run."),
    defaultKeyValueStoreId: s.string("The default key-value store identifier created for the run."),
    defaultRequestQueueId: s.string("The default request queue identifier created for the run."),
    stats: s.looseObject("The run statistics object."),
    options: s.looseObject("The run options object."),
    usage: s.looseObject("The run usage summary object."),
  },
  {
    optional: [
      "startedAt",
      "finishedAt",
      "defaultDatasetId",
      "defaultKeyValueStoreId",
      "defaultRequestQueueId",
      "stats",
      "options",
      "usage",
    ],
  },
);

export const apifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the currently authenticated Apify user account.",
    inputSchema: s.object("The input for retrieving the current Apify user.", {}),
    outputSchema: s.object("The current authenticated Apify user response.", {
      user: apifyUserSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_actor",
    operationType: "read",
    description: "Retrieve metadata for one Apify actor by identifier.",
    inputSchema: s.object("The input for retrieving one Apify actor.", {
      actorId: s.nonEmptyString("The Apify actor identifier, such as apify~web-scraper or apify/web-scraper."),
    }),
    outputSchema: s.object("The Apify actor response.", {
      actor: apifyActorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "run_actor",
    operationType: "write",
    description: "Start one Apify actor run with an optional JSON input payload.",
    inputSchema: s.object(
      "The input for starting one Apify actor run.",
      {
        actorId: s.nonEmptyString("The Apify actor identifier, such as apify~web-scraper or apify/web-scraper."),
        input: s.record("The JSON input object passed to the actor run.", apifyJsonValueSchema),
        build: s.nonEmptyString("The actor build tag or number to run."),
        memoryMbytes: s.positiveInteger("The memory limit for the run in megabytes."),
        timeoutSecs: s.positiveInteger("The maximum runtime for the run in seconds."),
      },
      { required: ["actorId"] },
    ),
    outputSchema: s.object("The Apify actor run creation response.", {
      run: apifyRunSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_run",
    operationType: "read",
    description: "Retrieve the current status and storage identifiers for one Apify actor run.",
    inputSchema: s.object(
      "The input for retrieving one Apify actor run.",
      {
        runId: s.nonEmptyString("The Apify actor run identifier."),
        waitForFinishSeconds: s.integer("How many seconds to wait for run completion before returning.", {
          minimum: 0,
          maximum: 60,
        }),
      },
      { required: ["runId"] },
    ),
    outputSchema: s.object("The Apify actor run response.", {
      run: apifyRunSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_dataset_items",
    operationType: "read",
    description: "Retrieve JSON items from one Apify dataset.",
    inputSchema: s.object(
      "The input for retrieving items from an Apify dataset.",
      {
        datasetId: s.nonEmptyString("The Apify dataset identifier."),
        limit: s.integer("The maximum number of items to return.", { minimum: 1 }),
        offset: s.integer("How many items to skip before returning results.", { minimum: 0 }),
        clean: s.boolean("Whether hidden fields and empty values should be removed from each item."),
        skipHidden: s.boolean("Whether fields starting with a hash sign should be skipped."),
      },
      { required: ["datasetId"] },
    ),
    outputSchema: s.object("The Apify dataset items response.", {
      items: s.array("The ordered list of Apify dataset items.", s.record(apifyJsonValueSchema)),
    }),
  }),
];
