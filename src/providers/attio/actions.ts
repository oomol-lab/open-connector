import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { attioCrmActions } from "./crm-actions.ts";

const service = "attio";
const nonEmptyString = (description: string) => s.nonEmptyString(description);
const rawObjectSchema = s.looseObject("A raw Attio object returned by the API.");
const rawRecordSchema = s.looseObject("A raw Attio record returned by the API.");
const rawAttributeSchema = s.looseObject("A raw Attio attribute returned by the API.");
const rawMetaSchema = s.looseObject("Raw Attio token and workspace metadata.");
const valuesSchema = s.looseObject(
  "Record values keyed by Attio attribute API slug or attribute ID. Values are forwarded using Attio's documented attribute value shapes.",
);
const filterSchema = s.looseObject(
  "Attio filter object forwarded to the list records endpoint. Cannot be combined with filterViewId.",
);
const sortsSchema = s.array("Sort definitions forwarded to Attio.", s.looseObject("One Attio sort definition."));
const paginationSchema = s.object(
  "Pagination parameters used for list-style Attio endpoints.",
  {
    limit: s.integer("The maximum number of items requested from Attio.", { minimum: 1 }),
    offset: s.integer("The zero-based offset requested from Attio.", { minimum: 0 }),
  },
  { optional: ["limit", "offset"] },
);
const listObjectsOutputSchema = s.object(
  "Objects returned by Attio.",
  {
    objects: s.array("Attio objects in the workspace.", rawObjectSchema),
  },
  { optional: [] },
);

const listAttributesOutputSchema = s.object(
  "Attributes returned by Attio.",
  {
    attributes: s.array("Attio attributes for the requested object, list or activity.", rawAttributeSchema),
    pagination: s.nullable(paginationSchema),
  },
  { optional: [] },
);

const recordOutputSchema = s.object(
  "A single Attio record result.",
  {
    record: rawRecordSchema,
  },
  { optional: [] },
);

const listRecordsOutputSchema = s.object(
  "Records returned by Attio.",
  {
    records: s.array("Attio records returned by the query.", rawRecordSchema),
    pagination: s.nullable(paginationSchema),
  },
  { optional: [] },
);

const identifyOutputSchema = s.object(
  "Attio credential metadata returned by /v2/self.",
  {
    active: s.boolean("Whether the token is active."),
    workspaceId: s.nullable(s.string("The Attio workspace ID associated with the token.")),
    workspaceName: s.nullable(s.string("The Attio workspace name associated with the token.")),
    workspaceSlug: s.nullable(s.string("The Attio workspace slug associated with the token.")),
    scope: s.nullable(s.string("The space-separated Attio scopes associated with the token.")),
    raw: rawMetaSchema,
  },
  { optional: [] },
);

const deleteRecordOutputSchema = s.object(
  "The delete status returned by Attio.",
  {
    deleted: s.boolean("Whether Attio accepted the record delete request."),
    raw: s.unknown("The raw Attio delete response payload."),
  },
  { optional: [] },
);

export const attioActions: readonly ActionDefinition[] = [
  ...attioCrmActions,
  defineProviderAction(service, {
    name: "identify",
    description: "Identify the current Attio access token, its workspace, and the scopes attached to it.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("No input is required to identify an Attio token.", {}, { optional: [] }),
    outputSchema: identifyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_objects",
    description: "List all system-defined and user-defined objects in an Attio workspace.",
    operationType: "read",
    requiredScopes: ["object_configuration:read"],
    inputSchema: s.object("No input is required to list Attio objects.", {}, { optional: [] }),
    outputSchema: listObjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_object",
    description: "Get one Attio object by object ID or API slug.",
    operationType: "read",
    requiredScopes: ["object_configuration:read"],
    inputSchema: s.object(
      "Input for retrieving an Attio object.",
      {
        object: nonEmptyString("The object ID or API slug, such as people or companies."),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The requested Attio object.",
      {
        object: rawObjectSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_attributes",
    description:
      "List attributes on an object, list or activity. Requires the selected target configuration read scope.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Attio attributes.",
      {
        target: s.stringEnum("Whether to list attributes for an object, list or activity.", [
          "objects",
          "lists",
          "activities",
        ]),
        identifier: nonEmptyString("The object, list or activity UUID or API slug."),
        limit: s.integer("The maximum number of attributes to return.", { minimum: 1 }),
        offset: s.integer("The zero-based pagination offset.", { minimum: 0 }),
        showArchived: s.boolean("Whether to include archived attributes."),
      },
      { optional: ["limit", "offset", "showArchived"] },
    ),
    outputSchema: listAttributesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_records",
    description:
      "List Attio records for an object with optional filtering, view filtering, sorting, limit, and offset.",
    operationType: "read",
    requiredScopes: ["record_permission:read", "object_configuration:read"],
    inputSchema: s.object(
      "Input for querying Attio records.",
      {
        object: nonEmptyString("The object ID or API slug, such as people or companies."),
        filter: filterSchema,
        filterViewId: s.uuid("A saved view UUID whose filter configuration should be applied."),
        sorts: sortsSchema,
        limit: s.integer("The maximum number of records to return.", { minimum: 1 }),
        offset: s.integer("The zero-based pagination offset.", { minimum: 0 }),
      },
      { optional: ["filter", "filterViewId", "sorts", "limit", "offset"] },
    ),
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_record",
    description: "Get a single Attio record by object and record ID.",
    operationType: "read",
    requiredScopes: ["record_permission:read", "object_configuration:read"],
    inputSchema: s.object(
      "Input for retrieving an Attio record.",
      {
        object: nonEmptyString("The object ID or API slug, such as people or companies."),
        recordId: s.uuid("The Attio record UUID."),
      },
      { optional: [] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_record",
    description: "Create a record for an Attio object using documented attribute value shapes.",
    operationType: "write",
    requiredScopes: ["record_permission:read-write", "object_configuration:read"],
    inputSchema: s.object(
      "Input for creating an Attio record.",
      {
        object: nonEmptyString("The object ID or API slug, such as people or companies."),
        values: valuesSchema,
      },
      { optional: [] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_record",
    description:
      "Create or update an Attio record for an object using a matching attribute that identifies at most one record.",
    operationType: "write",
    requiredScopes: ["record_permission:read-write", "object_configuration:read"],
    inputSchema: s.object(
      "Input for upserting an Attio record.",
      {
        object: nonEmptyString("The object ID or API slug, such as people or companies."),
        matchingAttribute: nonEmptyString(
          "The matching attribute API slug or ID. It need not be unique, but multiple matching records are rejected.",
        ),
        values: valuesSchema,
      },
      { optional: [] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_record",
    description:
      "Update an Attio record by appending or overwriting multiselect values according to Attio's PATCH and PUT semantics.",
    operationType: "write",
    requiredScopes: ["record_permission:read-write", "object_configuration:read"],
    inputSchema: s.object(
      "Input for updating an Attio record.",
      {
        object: nonEmptyString("The object ID or API slug, such as people or companies."),
        recordId: s.uuid("The Attio record UUID."),
        values: valuesSchema,
        mode: s.stringEnum("How Attio should handle multiselect attribute values.", [
          "append_multiselect",
          "overwrite_multiselect",
        ]),
      },
      { optional: ["mode"] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_record",
    description: "Delete a single Attio record by object and record ID.",
    operationType: "destructive",
    requiredScopes: ["record_permission:read-write", "object_configuration:read"],
    inputSchema: s.object(
      "Input for deleting an Attio record.",
      {
        object: nonEmptyString("The object ID or API slug, such as people or companies."),
        recordId: s.uuid("The Attio record UUID."),
      },
      { optional: [] },
    ),
    outputSchema: deleteRecordOutputSchema,
  }),
] as const satisfies readonly ActionDefinition[];
