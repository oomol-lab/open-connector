import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "axiom";

const datasetIdSchema = s.nonEmptyString("The Axiom dataset ID or unique dataset name.");
const datasetNameSchema = s.nonEmptyString("The unique Axiom dataset name.");
const datasetKindSchema = s.stringEnum("The Axiom dataset kind.", [
  "otel:metrics:v1",
  "otel:traces:v1",
  "otel:logs:v1",
  "axiom:events:v1",
]);

const datasetSchema = s.looseObject("An Axiom dataset resource.", {
  canWrite: s.boolean("Whether the dataset can accept writes with the current token."),
  created: s.string("The RFC3339-formatted time when the dataset was created."),
  description: s.string("The dataset description."),
  edgeDeployment: s.string("The edge deployment assigned to the dataset."),
  id: s.string("The Axiom dataset ID."),
  kind: s.string("The Axiom dataset kind."),
  mapFields: s.stringArray("Map fields configured on the dataset."),
  name: s.string("The unique Axiom dataset name."),
  retentionDays: s.integer("The number of days Axiom retains data in the dataset."),
  sharedByOrg: s.string("The organization ID that shared this dataset when applicable."),
  updatedAt: s.string("The RFC3339-formatted time when the dataset was last updated."),
  useRetentionPeriod: s.boolean("Whether the dataset uses a retention period."),
  who: s.string("The display name of the dataset creator."),
});

const queryStatusSchema = s.looseObject("The Axiom query execution status.", {
  blocksCached: s.integer("The number of blocks served from cache."),
  blocksExamined: s.integer("The number of blocks examined by the query."),
  blocksMatched: s.integer("The number of blocks matched by the query."),
  cacheStatus: s.integer("The Axiom cache status code for the query."),
  elapsedTime: s.integer("The query elapsed time in nanoseconds."),
  isPartial: s.boolean("Whether Axiom returned a partial query result."),
  maxBlockTime: s.string("The latest block time scanned by the query."),
  maxCursor: s.string("The maximum cursor returned by the query."),
  minBlockTime: s.string("The earliest block time scanned by the query."),
  minCursor: s.string("The minimum cursor returned by the query."),
  numGroups: s.integer("The number of groups produced by the query."),
  rowsExamined: s.integer("The number of rows examined by the query."),
  rowsMatched: s.integer("The number of rows matched by the query."),
});

const queryOptionsSchema = s.looseObject("Axiom query options passed through to the APL API.");
const variablesSchema = s.record("Variables inserted into the APL query.", s.looseObject("One Axiom query variable value."));

export const axiomActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_datasets",
    description: "List Axiom datasets visible to the current token.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Axiom datasets.", {}),
    outputSchema: s.object("The response returned when listing Axiom datasets.", {
      datasets: s.array("The datasets returned by Axiom.", datasetSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_dataset",
    description: "Get an Axiom dataset by ID or unique name.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting an Axiom dataset.", {
      dataset_id: datasetIdSchema,
    }),
    outputSchema: s.object("The response returned when getting an Axiom dataset.", {
      dataset: datasetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_dataset",
    description: "Create an Axiom dataset.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for creating an Axiom dataset.",
      {
        name: datasetNameSchema,
        description: s.string("The dataset description."),
        edgeDeployment: s.nonEmptyString("The edge deployment assigned to the dataset."),
        kind: datasetKindSchema,
        retentionDays: s.integer("The number of days Axiom should retain data in the dataset."),
        useRetentionPeriod: s.boolean("Whether the dataset should use a retention period."),
        referrer: s.nonEmptyString("Optional referrer slug sent as the create dataset query parameter."),
      },
      {
        optional: [
          "description",
          "edgeDeployment",
          "kind",
          "retentionDays",
          "useRetentionPeriod",
          "referrer",
        ],
      },
    ),
    outputSchema: s.object("The response returned when creating an Axiom dataset.", {
      dataset: datasetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_dataset",
    description: "Delete an Axiom dataset by ID or unique name.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting an Axiom dataset.", {
      dataset_id: datasetIdSchema,
    }),
    outputSchema: s.object("The response returned when deleting an Axiom dataset.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
    }),
  }),
  defineProviderAction(service, {
    name: "run_apl_query",
    description: "Run an Axiom Processing Language query through the global API endpoint.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for running an Axiom APL query.",
      {
        apl: s.nonEmptyString("The APL query string to execute."),
        format: s.stringEnum("The Axiom query result format.", ["legacy", "tabular"]),
        nocache: s.boolean("Whether Axiom should bypass cached query results."),
        saveAsKind: s.nonEmptyString("The saved query result kind."),
        dataset_name: s.nonEmptyString("The associated dataset name when saving query results."),
        cursor: s.nonEmptyString("The query cursor returned by a previous Axiom query."),
        endTime: s.nonEmptyString("The query end time as RFC3339 or a relative time expression."),
        includeCursor: s.boolean("Whether the query response should include cursors."),
        queryOptions: queryOptionsSchema,
        startTime: s.nonEmptyString("The query start time as RFC3339 or a relative time expression."),
        variables: variablesSchema,
      },
      {
        optional: [
          "format",
          "nocache",
          "saveAsKind",
          "dataset_name",
          "cursor",
          "endTime",
          "includeCursor",
          "queryOptions",
          "startTime",
          "variables",
        ],
      },
    ),
    outputSchema: s.object("The response returned when running an Axiom APL query.", {
      result: s.looseObject("The raw Axiom query result."),
      datasetNames: s.stringArray("The dataset names included in the query result."),
      format: s.string("The Axiom query result format."),
      status: queryStatusSchema,
    }),
  }),
];

export type AxiomActionName = (typeof axiomActions)[number]["name"];
