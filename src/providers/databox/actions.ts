import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "databox";
const status = s.string("The Databox request status.");
const message = s.string("The human-readable Databox response message.");
const requestId = s.string("The Databox request identifier.");
const accountId = s.integer("The Databox account identifier.");
const dataSourceId = s.uuid("The Databox data source identifier.");
const datasetId = s.uuid("The Databox dataset identifier.");
const ingestionId = s.uuid("The Databox ingestion identifier.");
const dataSource = s.looseRequiredObject("A Databox data source.", {
  id: dataSourceId,
  type: s.string("The Databox data source type."),
  title: s.string("The Databox data source title."),
  status,
});
const dataset = s.looseRequiredObject("A Databox dataset.", {
  id: datasetId,
  title: s.string("The Databox dataset title."),
  status,
});
const deletion = s.looseRequiredObject("A Databox deletion response.", { status, message, requestId });
const ingestion = s.looseRequiredObject("A Databox ingestion response.", { status, message, requestId, ingestionId });
const datasetRecord = s.record(
  "One Databox dataset record. Keys must match the target dataset schema.",
  s.unknown("One JSON record value."),
);

export const databoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Databox accounts accessible to the API key.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      status,
      requestId,
      accounts: s.array(
        s.looseRequiredObject("A Databox account accessible to the API key.", {
          id: accountId,
          name: s.string("The Databox account display name."),
          accountType: s.string("The Databox account type."),
        }),
        { description: "The Databox accounts returned by the API." },
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "create_data_source",
    description: "Create a Databox ingestion data source in an account.",
    inputSchema: s.actionInput(
      {
        accountId,
        title: s.nonEmptyString("The display title for the Databox resource."),
        timezone: s.nonEmptyString("The IANA timezone identifier for the Databox data source."),
      },
      ["accountId", "title", "timezone"],
    ),
    outputSchema: s.actionOutput({ requestId, dataSource }),
  }),
  defineProviderAction(service, {
    name: "delete_data_source",
    description: "Delete a Databox data source by ID.",
    inputSchema: s.actionInput({ dataSourceId }, ["dataSourceId"]),
    outputSchema: deletion,
  }),
  defineProviderAction(service, {
    name: "create_dataset",
    description: "Create a Databox dataset within an ingestion data source.",
    inputSchema: s.actionInput(
      {
        dataSourceId,
        title: s.nonEmptyString("The display title for the Databox resource."),
        primaryKeys: s.stringArray("The field names that uniquely identify records in the Databox dataset.", {
          minItems: 1,
        }),
      },
      ["dataSourceId", "title", "primaryKeys"],
    ),
    outputSchema: s.actionOutput({ requestId, dataset }),
  }),
  defineProviderAction(service, {
    name: "delete_dataset",
    description: "Delete a Databox dataset by ID.",
    inputSchema: s.actionInput({ datasetId }, ["datasetId"]),
    outputSchema: deletion,
  }),
  defineProviderAction(service, {
    name: "push_dataset_data",
    description: "Push JSON records into a Databox dataset.",
    inputSchema: s.actionInput(
      {
        datasetId,
        records: s.array(datasetRecord, { minItems: 1, description: "The Databox dataset records to ingest." }),
      },
      ["datasetId", "records"],
    ),
    outputSchema: ingestion,
  }),
  defineProviderAction(service, {
    name: "get_dataset_ingestion_status",
    description: "Get the processing status of a Databox dataset ingestion.",
    inputSchema: s.actionInput({ datasetId, ingestionId }, ["datasetId", "ingestionId"]),
    outputSchema: ingestion,
  }),
];
