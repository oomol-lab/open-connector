import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "anydb";
const idField = (description: string) => s.nonEmptyString(description);
const looseObject = (description: string) => s.looseRequiredObject(description, {});

const teamSchema = s.looseRequiredObject("An AnyDB team accessible to the connected account.", {
  teamid: idField("The AnyDB team identifier."),
  name: s.string("The display name of the AnyDB team."),
});

const databaseSchema = s.looseRequiredObject("An AnyDB database accessible to the connected account.", {
  adbid: idField("The AnyDB database identifier."),
  teamid: idField("The identifier of the team that owns the database."),
  name: s.string("The display name of the AnyDB database."),
});

const recordSchema = s.looseRequiredObject(
  "An AnyDB record returned by the API.",
  {
    meta: s.looseRequiredObject("The stable metadata fields that identify the AnyDB record.", {
      adoid: idField("The AnyDB record identifier."),
      adbid: idField("The identifier of the database containing the record."),
      teamid: idField("The identifier of the team containing the record."),
      name: s.string("The display name of the record."),
    }),
    content: looseObject("The record cells keyed by their AnyDB cell positions."),
  },
  { optional: ["content"] },
);

const recordSummarySchema = s.looseRequiredObject("An AnyDB record summary returned by a list operation.", {});

export const anydbActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_teams",
    operationType: "read",
    requiredScopes: [],
    description: "List the AnyDB teams accessible to the connected account.",
    inputSchema: s.object("No input is required to list accessible AnyDB teams.", {}),
    outputSchema: s.object("The accessible AnyDB teams.", {
      teams: s.array("The accessible AnyDB teams.", teamSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_databases",
    operationType: "read",
    requiredScopes: [],
    description: "List the AnyDB databases in a team.",
    inputSchema: s.object("The team whose databases should be listed.", {
      teamid: idField("The AnyDB team identifier."),
    }),
    outputSchema: s.object("The databases in the selected team.", {
      databases: s.array("The databases in the selected team.", databaseSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    requiredScopes: [],
    description: "List records in an AnyDB database with cursor pagination and optional hierarchy filters.",
    inputSchema: s.object(
      "The database, optional filters, and pagination cursor used to list records.",
      {
        teamid: idField("The AnyDB team identifier."),
        adbid: idField("The AnyDB database identifier."),
        parentid: idField("An optional parent record identifier used to list children."),
        templateid: idField("An optional template identifier used to filter records."),
        templatename: s.nonEmptyString("An optional template name used to filter records."),
        pagesize: s.positiveInteger("The maximum number of records to return."),
        lastmarker: s.nonEmptyString("The pagination marker returned by the previous page."),
      },
      { optional: ["parentid", "templateid", "templatename", "pagesize", "lastmarker"] },
    ),
    outputSchema: s.object(
      "The record page and pagination state returned by AnyDB.",
      {
        items: s.array("The records in this page.", recordSummarySchema),
        lastmarker: s.string("The marker to pass when requesting the next page."),
        hasmore: s.boolean("Whether another page is available."),
        total: s.nonNegativeInteger("The total number of matching records when provided."),
      },
      { optional: ["lastmarker", "hasmore", "total"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    requiredScopes: [],
    description: "Get one AnyDB record with its metadata and cell content.",
    inputSchema: s.object("The identifiers of the record to retrieve.", {
      teamid: idField("The AnyDB team identifier."),
      adbid: idField("The AnyDB database identifier."),
      adoid: idField("The AnyDB record identifier."),
    }),
    outputSchema: s.object("The selected AnyDB record.", { record: recordSchema }),
  }),
  defineProviderAction(service, {
    name: "search_records",
    operationType: "read",
    requiredScopes: [],
    description: "Search records in an AnyDB database by keyword.",
    inputSchema: s.object(
      "The database and keyword used to search AnyDB records.",
      {
        teamid: idField("The AnyDB team identifier."),
        adbid: idField("The AnyDB database identifier."),
        search: s.nonEmptyString("The keyword to search for."),
        limit: s.positiveInteger("The maximum number of matching records to return."),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The AnyDB records matching the keyword.", {
      records: s.array("The matching AnyDB records.", recordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    requiredScopes: [],
    description: "Create a structured record in an AnyDB database.",
    inputSchema: s.object(
      "The metadata and optional cell content for the new AnyDB record.",
      {
        teamid: idField("The AnyDB team identifier."),
        adbid: idField("The AnyDB database identifier."),
        name: s.nonEmptyString("The display name of the new record."),
        attach: idField("An optional parent record identifier to attach the new record to."),
        template: idField("An optional AnyDB template identifier."),
        content: looseObject("The record cells keyed by their AnyDB cell positions."),
      },
      { optional: ["attach", "template", "content"] },
    ),
    outputSchema: s.object("The newly created AnyDB record.", { record: recordSchema }),
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    requiredScopes: [],
    description: "Update the metadata or cell content of an AnyDB record.",
    inputSchema: s.object(
      "The record identifiers and partial metadata or content to update.",
      {
        meta: s.looseRequiredObject("The record identity and metadata fields to update.", {
          adoid: idField("The AnyDB record identifier."),
          adbid: idField("The AnyDB database identifier."),
          teamid: idField("The AnyDB team identifier."),
        }),
        content: looseObject("The record cells to update, keyed by AnyDB cell position."),
      },
      { optional: ["content"] },
    ),
    outputSchema: s.object("The updated AnyDB record.", { record: recordSchema }),
  }),
];
