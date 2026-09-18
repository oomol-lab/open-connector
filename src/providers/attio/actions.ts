import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "attio";

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

const recordOutputSchema = s.object("A single Attio record result.", {
  record: s.nullable(rawRecordSchema),
});

const listRecordsInputSchema = s.object(
  "Input for querying Attio records.",
  {
    object: s.nonEmptyString("The object ID or API slug, such as people or companies."),
    filter: filterSchema,
    filterViewId: s.uuid("A saved view UUID whose filter configuration should be applied."),
    sorts: sortsSchema,
    limit: s.integer("The maximum number of records to return.", { minimum: 1 }),
    offset: s.integer("The zero-based pagination offset.", { minimum: 0 }),
  },
  { optional: ["filter", "filterViewId", "sorts", "limit", "offset"] },
);
listRecordsInputSchema.not = { required: ["filter", "filterViewId"] };

export const attioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "identify",
    operationType: "read",
    description: "Identify the current Attio access token, its workspace, and the scopes attached to it.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to identify an Attio token.", {}),
    outputSchema: s.object("Attio credential metadata returned by /v2/self.", {
      active: s.boolean("Whether the token is active."),
      workspaceId: s.nullable(s.string("The Attio workspace ID associated with the token.")),
      workspaceName: s.nullable(s.string("The Attio workspace name associated with the token.")),
      workspaceSlug: s.nullable(s.string("The Attio workspace slug associated with the token.")),
      scope: s.nullable(s.string("The space-separated Attio scopes associated with the token.")),
      raw: rawMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_objects",
    operationType: "read",
    description: "List all system-defined and user-defined objects in an Attio workspace.",
    requiredScopes: ["object_configuration:read"],
    inputSchema: s.object("No input is required to list Attio objects.", {}),
    outputSchema: s.object("Objects returned by Attio.", {
      objects: s.array("Attio objects in the workspace.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_object",
    operationType: "read",
    description: "Get one Attio object by object ID or API slug.",
    requiredScopes: ["object_configuration:read"],
    inputSchema: s.object("Input for retrieving an Attio object.", {
      object: s.nonEmptyString("The object ID or API slug, such as people or companies."),
    }),
    outputSchema: s.object("The requested Attio object.", {
      object: s.nullable(rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_attributes",
    operationType: "read",
    description: "List attributes defined on an Attio object or list.",
    requiredScopes: ["object_configuration:read"],
    inputSchema: s.object(
      "Input for listing Attio attributes.",
      {
        target: s.stringEnum("Whether to list attributes for an Attio object or list.", ["objects", "lists"]),
        identifier: s.nonEmptyString("The object or list ID, or object/list API slug."),
        limit: s.integer("The maximum number of attributes to return.", { minimum: 1 }),
        offset: s.integer("The zero-based pagination offset.", { minimum: 0 }),
        showArchived: s.boolean("Whether to include archived attributes."),
      },
      { optional: ["limit", "offset", "showArchived"] },
    ),
    outputSchema: s.object("Attributes returned by Attio.", {
      attributes: s.array("Attio attributes for the requested object or list.", rawAttributeSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    description:
      "List Attio records for an object with optional filtering, view filtering, sorting, limit, and offset.",
    requiredScopes: ["record_permission:read", "object_configuration:read"],
    inputSchema: listRecordsInputSchema,
    outputSchema: s.object("Records returned by Attio.", {
      records: s.array("Attio records returned by the query.", rawRecordSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    description: "Get a single Attio record by object and record ID.",
    requiredScopes: ["record_permission:read", "object_configuration:read"],
    inputSchema: s.object("Input for retrieving an Attio record.", {
      object: s.nonEmptyString("The object ID or API slug, such as people or companies."),
      recordId: s.uuid("The Attio record UUID."),
    }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    description: "Create a record for an Attio object using documented attribute value shapes.",
    requiredScopes: ["record_permission:read-write", "object_configuration:read"],
    inputSchema: s.object("Input for creating an Attio record.", {
      object: s.nonEmptyString("The object ID or API slug, such as people or companies."),
      values: valuesSchema,
    }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_record",
    operationType: "write",
    description: "Create or update an Attio record for an object using a unique matching attribute.",
    requiredScopes: ["record_permission:read-write", "object_configuration:read"],
    inputSchema: s.object("Input for upserting an Attio record.", {
      object: s.nonEmptyString("The object ID or API slug, such as people or companies."),
      matchingAttribute: s.nonEmptyString("The unique attribute API slug or ID used to find matches."),
      values: valuesSchema,
    }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    description:
      "Update an Attio record by appending or overwriting multiselect values according to Attio's PATCH and PUT semantics.",
    requiredScopes: ["record_permission:read-write", "object_configuration:read"],
    inputSchema: s.object(
      "Input for updating an Attio record.",
      {
        object: s.nonEmptyString("The object ID or API slug, such as people or companies."),
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
    operationType: "destructive",
    description: "Delete a single Attio record by object and record ID.",
    requiredScopes: ["record_permission:read-write", "object_configuration:read"],
    inputSchema: s.object("Input for deleting an Attio record.", {
      object: s.nonEmptyString("The object ID or API slug, such as people or companies."),
      recordId: s.uuid("The Attio record UUID."),
    }),
    outputSchema: s.object("The delete status returned by Attio.", {
      deleted: s.boolean("Whether Attio accepted the record delete request."),
      raw: s.unknown("The raw Attio delete response payload."),
    }),
  }),
];
