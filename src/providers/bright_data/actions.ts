import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bright_data";

const datasetIdSchema = s.nonEmptyString("The Bright Data dataset identifier.");
const snapshotIdSchema = s.nonEmptyString("The Bright Data snapshot identifier.");

const datasetSchema = s.object("A Bright Data marketplace dataset summary.", {
  id: s.string("The unique dataset identifier."),
  name: s.string("The human-readable dataset name."),
  size: s.integer("The number of records in the dataset."),
});

const rawObjectSchema = s.unknownObject("The raw Bright Data response object.");

const fieldMetadataSchema = s.looseRequiredObject(
  "Metadata for one Bright Data dataset field.",
  {
    type: s.string("The Bright Data field data type."),
    active: s.boolean("Whether the field is currently active."),
    required: s.boolean("Whether the field is required when present."),
    description: s.string("The field description returned by Bright Data."),
  },
  { optional: ["type", "active", "required", "description"] },
);

const datasetViewSchema = s.looseRequiredObject(
  "A Bright Data dataset view.",
  {
    id: s.string("The unique dataset view identifier."),
    name: s.string("The customer-assigned dataset view name."),
    dataset_id: s.string("The underlying Bright Data dataset identifier."),
    dataset_name: s.string("The underlying Bright Data dataset name."),
    domain: s.string("The primary domain of the dataset."),
  },
  { optional: ["id", "name", "dataset_id", "dataset_name", "domain"] },
);

const snapshotStatusSchema = s.stringEnum("The Bright Data snapshot status.", [
  "scheduled",
  "building",
  "ready",
  "failed",
]);

const snapshotMetadataSchema = s.looseRequiredObject(
  "Bright Data snapshot metadata.",
  {
    id: s.string("The snapshot identifier."),
    created: s.dateTime("The timestamp when the snapshot was created."),
    status: snapshotStatusSchema,
    dataset_id: s.string("The dataset identifier associated with the snapshot."),
    customer_id: s.string("The Bright Data customer identifier."),
    dataset_size: s.integer("The number of records in the snapshot."),
    file_size: s.integer("The snapshot file size in bytes."),
    cost: s.number("The snapshot cost."),
    error: s.string("The snapshot error message when available."),
    error_code: s.string("The snapshot error code when available."),
    warning: s.string("The snapshot warning message when available."),
    warning_code: s.string("The snapshot warning code when available."),
    initiation_type: s.string("The Bright Data initiation type for the snapshot."),
  },
  {
    optional: [
      "id",
      "created",
      "status",
      "dataset_id",
      "customer_id",
      "dataset_size",
      "file_size",
      "cost",
      "error",
      "error_code",
      "warning",
      "warning_code",
      "initiation_type",
    ],
  },
);

const snapshotFormatSchema = s.stringEnum("The snapshot delivery format.", ["json", "ndjson", "jsonl", "csv"]);

export const brightDataActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_status",
    operationType: "read",
    description:
      "Fetch the Bright Data account status for the connected API key and return account request capability metadata.",
    inputSchema: s.actionInput({}, [], "Input parameters for fetching Bright Data account status."),
    outputSchema: s.actionOutput(
      {
        status: s.string("The Bright Data account status."),
        customer: s.string("The Bright Data customer identifier."),
        canMakeRequests: s.boolean("Whether the account can make requests."),
        authFailReason: s.nullableString("The upstream authentication failure reason, when returned."),
        ip: s.nullableString("The IP address Bright Data observed for the request."),
        raw: rawObjectSchema,
      },
      "Bright Data account status response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_datasets",
    operationType: "read",
    description: "List Bright Data marketplace dataset IDs available to the connected account.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing Bright Data datasets."),
    outputSchema: s.actionOutput(
      {
        datasets: s.array("Datasets returned by Bright Data.", datasetSchema),
        raw: s.array("The raw Bright Data dataset list payload.", rawObjectSchema),
      },
      "Bright Data dataset list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dataset_metadata",
    operationType: "read",
    description: "Fetch Bright Data marketplace dataset field metadata for a dataset ID.",
    inputSchema: s.actionInput(
      {
        datasetId: datasetIdSchema,
      },
      ["datasetId"],
      "Input parameters for fetching Bright Data dataset metadata.",
    ),
    outputSchema: s.actionOutput(
      {
        id: s.string("The Bright Data dataset identifier."),
        fields: s.record("Dataset fields keyed by field name.", fieldMetadataSchema),
        raw: rawObjectSchema,
      },
      "Bright Data dataset metadata response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_dataset_views",
    operationType: "read",
    description: "List Bright Data dataset views available to the connected account.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing Bright Data dataset views."),
    outputSchema: s.actionOutput(
      {
        views: s.array("Dataset views returned by Bright Data.", datasetViewSchema),
        raw: s.array("The raw Bright Data dataset views payload.", rawObjectSchema),
      },
      "Bright Data dataset views response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_snapshot_metadata",
    operationType: "read",
    description: "Fetch metadata for a Bright Data marketplace dataset snapshot.",
    inputSchema: s.actionInput(
      {
        snapshotId: snapshotIdSchema,
      },
      ["snapshotId"],
      "Input parameters for fetching Bright Data snapshot metadata.",
    ),
    outputSchema: s.actionOutput(
      {
        snapshot: snapshotMetadataSchema,
        raw: rawObjectSchema,
      },
      "Bright Data snapshot metadata response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_snapshot_parts",
    operationType: "read",
    description: "Fetch the number of delivery parts for a ready Bright Data marketplace dataset snapshot.",
    inputSchema: s.actionInput(
      {
        snapshotId: snapshotIdSchema,
        format: snapshotFormatSchema,
        compress: s.boolean("Whether the corresponding snapshot download uses gzip compression."),
        batchSize: s.integer("The record count used for each response batch.", { minimum: 1000 }),
      },
      ["snapshotId"],
      "Input parameters for fetching Bright Data snapshot parts.",
    ),
    outputSchema: s.actionOutput(
      {
        parts: s.number("The number of snapshot delivery parts."),
        raw: rawObjectSchema,
      },
      "Bright Data snapshot parts response.",
    ),
  }),
];
