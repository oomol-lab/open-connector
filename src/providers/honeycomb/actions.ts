import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "honeycomb";

const rawObjectSchema = s.looseObject("The raw Honeycomb object returned by the API.");

const authSummarySchema = s.object("Honeycomb API key authorization metadata.", {
  id: s.string("The unique identifier of the API key."),
  type: s.string("The Honeycomb API key type, such as configuration or ingest."),
  apiKeyAccess: s.looseObject("The permission flags returned for this API key."),
  environment: s.object("The Honeycomb environment associated with the API key.", {
    name: s.string("The environment name, or an empty string for Honeycomb Classic."),
    slug: s.string("The environment slug, or an empty string for Honeycomb Classic."),
  }),
  team: s.object("The Honeycomb team associated with the API key.", {
    name: s.string("The team name."),
    slug: s.string("The team slug."),
  }),
  raw: rawObjectSchema,
});

const datasetSchema = s.object("A Honeycomb dataset summary.", {
  name: s.string("The dataset name."),
  slug: s.nullableString("The dataset slug used in Honeycomb API paths."),
  description: s.nullableString("The dataset description."),
  expandJsonDepth: s.nullableInteger("The maximum unpacking depth of nested JSON fields."),
  regularColumnsCount: s.nullableInteger("The total number of unique regular columns in the dataset."),
  createdAt: s.nullableString("The ISO 8601 timestamp when the dataset was created."),
  lastWrittenAt: s.nullableString("The ISO 8601 timestamp when the dataset last received event data."),
  raw: rawObjectSchema,
});

const markerSchema = s.object("A Honeycomb marker summary.", {
  id: s.nullableString("The Honeycomb marker identifier."),
  message: s.nullableString("The marker message."),
  type: s.nullableString("The marker type used to group similar markers."),
  startTime: s.nullableInteger("The Unix timestamp where the marker starts."),
  endTime: s.nullableInteger("The Unix timestamp where the marker ends."),
  url: s.nullableString("The URL attached to the marker."),
  color: s.nullableString("The marker color returned by Honeycomb when available."),
  createdAt: s.nullableString("The ISO 8601 timestamp when the marker was created."),
  updatedAt: s.nullableString("The ISO 8601 timestamp when the marker was updated."),
  raw: rawObjectSchema,
});

const boardSchema = s.object("A Honeycomb board summary.", {
  id: s.nullableString("The Honeycomb board identifier."),
  name: s.string("The board name."),
  description: s.nullableString("The board description."),
  type: s.nullableString("The board type returned by Honeycomb."),
  boardUrl: s.nullableString("The Honeycomb UI URL for the board when returned."),
  tags: s.array("The key-value tags attached to the board.", s.looseObject("A Honeycomb board tag.")),
  raw: rawObjectSchema,
});

const datasetSlugInputSchema = s.actionInput(
  {
    datasetSlug: s.nonEmptyString("The dataset slug used in Honeycomb API paths."),
  },
  ["datasetSlug"],
  "Input identifying a Honeycomb dataset.",
);

const markerDatasetSlugInputSchema = s.actionInput(
  {
    datasetSlug: s.nonEmptyString("The dataset slug, or __all__ to operate on environment-wide markers."),
  },
  ["datasetSlug"],
  "Input identifying a Honeycomb dataset or the environment-wide marker namespace.",
);

export const honeycombActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_auth",
    description: "Validate the Honeycomb API key and return the team, environment, key type, and permission metadata.",
    inputSchema: s.actionInput({}, [], "Input parameters for reading Honeycomb authorization metadata."),
    outputSchema: s.actionOutput({ authorization: authSummarySchema }, "The Honeycomb authorization metadata result."),
  }),
  defineProviderAction(service, {
    name: "list_datasets",
    description: "List datasets available in the Honeycomb environment tied to the API key.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing Honeycomb datasets."),
    outputSchema: s.actionOutput(
      { datasets: s.array("The datasets returned by Honeycomb.", datasetSchema) },
      "The Honeycomb dataset list result.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dataset",
    description: "Get one Honeycomb dataset by slug.",
    inputSchema: datasetSlugInputSchema,
    outputSchema: s.actionOutput({ dataset: datasetSchema }, "The Honeycomb dataset lookup result."),
  }),
  defineProviderAction(service, {
    name: "list_markers",
    description: "List Honeycomb markers for a dataset or for the environment-wide __all__ marker scope.",
    inputSchema: markerDatasetSlugInputSchema,
    outputSchema: s.actionOutput(
      { markers: s.array("The markers returned by Honeycomb.", markerSchema) },
      "The Honeycomb marker list result.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_marker",
    description: "Create a Honeycomb marker for a dataset or for the environment-wide __all__ marker scope.",
    inputSchema: s.object(
      "Input parameters for creating a Honeycomb marker.",
      {
        datasetSlug: s.nonEmptyString("The dataset slug, or __all__ to create an environment-wide marker."),
        message: s.nonEmptyString("A message that describes this marker."),
        type: s.nonEmptyString("The marker type used to group similar markers."),
        startTime: s.integer(
          "The Unix timestamp where the marker starts. Honeycomb defaults this to request time when omitted.",
        ),
        endTime: s.integer("The Unix timestamp where the marker ends."),
        url: s.nonEmptyString("A URL attached to the marker."),
      },
      { optional: ["startTime", "endTime", "url"] },
    ),
    outputSchema: s.actionOutput({ marker: markerSchema }, "The Honeycomb marker creation result."),
  }),
  defineProviderAction(service, {
    name: "list_boards",
    description: "List non-secret Honeycomb boards available in the API key environment.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing Honeycomb boards."),
    outputSchema: s.actionOutput(
      { boards: s.array("The boards returned by Honeycomb.", boardSchema) },
      "The Honeycomb board list result.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_board",
    description: "Get one Honeycomb board by ID.",
    inputSchema: s.actionInput(
      { boardId: s.nonEmptyString("The Honeycomb board ID.") },
      ["boardId"],
      "Input parameters for reading a Honeycomb board.",
    ),
    outputSchema: s.actionOutput({ board: boardSchema }, "The Honeycomb board lookup result."),
  }),
];
