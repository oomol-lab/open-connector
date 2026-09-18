import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "espocrm";

const emptyInputSchema = s.object("The input payload for this action.", {});
const nonEmptyStringField = (description: string) => s.nonEmptyString(description);
const rawObjectSchema = s.looseObject("An arbitrary JSON object returned by EspoCRM.");

const entityTypeField = nonEmptyStringField("The EspoCRM entity type, such as Account or Contact.");
const recordIdField = nonEmptyStringField("The EspoCRM record identifier.");
const recordDataSchema = s.record(
  "The EspoCRM record fields to create or update.",
  s.unknown("One EspoCRM record field value."),
);

const whereItemSchema = s.looseRequiredObject(
  "One EspoCRM where clause item.",
  {
    type: nonEmptyStringField("The EspoCRM where clause type."),
    attribute: nonEmptyStringField("The EspoCRM field name used by this where clause."),
    value: s.unknown("The comparison value for this where clause."),
  },
  { optional: ["attribute", "value"] },
);

const getMetadataInputSchema = s.object(
  "The input payload for reading EspoCRM metadata.",
  {
    key: nonEmptyStringField("Optional metadata path to return, such as entityDefs.Lead.fields.status.options."),
  },
  { optional: ["key"] },
);

const listRecordsInputSchema = s.object(
  "The input payload for listing EspoCRM records.",
  {
    entityType: entityTypeField,
    maxSize: s.integer("The maximum number of records to return.", {
      minimum: 1,
      maximum: 200,
    }),
    offset: s.nonNegativeInteger("The zero-based list offset."),
    orderBy: nonEmptyStringField("The EspoCRM field used for sorting."),
    order: s.stringEnum("The sort direction.", ["asc", "desc"]),
    where: s.array("EspoCRM where clauses passed as JSON.", whereItemSchema, { minItems: 1 }),
  },
  { optional: ["maxSize", "offset", "orderBy", "order", "where"] },
);

const userSchema = s.looseRequiredObject(
  "The current EspoCRM user.",
  {
    id: s.nullableString("The EspoCRM user identifier."),
    name: s.nullableString("The EspoCRM user's display name."),
    userName: s.nullableString("The EspoCRM login username."),
    type: s.nullableString("The EspoCRM user type."),
    emailAddress: s.nullableString("The user's primary email address."),
    isActive: s.boolean("Whether the EspoCRM user is active."),
  },
  { optional: ["id", "name", "userName", "type", "emailAddress", "isActive"] },
);

const appUserOutputSchema = s.object(
  "The current EspoCRM app user payload.",
  {
    user: userSchema,
    acl: s.looseObject("The user's access-control payload when returned."),
    preferences: s.looseObject("The user's preference payload when returned."),
  },
  { optional: ["acl", "preferences"] },
);

const metadataOutputSchema = s.object("The EspoCRM metadata output payload.", {
  metadata: s.unknown("The EspoCRM metadata payload returned by the server."),
});

const listRecordsOutputSchema = s.object("The EspoCRM list records output payload.", {
  records: s.array("The EspoCRM records returned by the list request.", rawObjectSchema),
  total: s.nullable(
    s.integer("The total number of records reported by EspoCRM, -1/-2 sentinel values, or null.", {
      minimum: -2,
    }),
  ),
});

const recordOutputSchema = s.object("The EspoCRM record output payload.", {
  record: rawObjectSchema,
});

const deleteRecordOutputSchema = s.object("The EspoCRM delete record output payload.", {
  ok: s.boolean("Whether EspoCRM confirmed the record deletion."),
});

export const espocrmActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_app_user",
    operationType: "read",
    description:
      "Get the current EspoCRM user data for the configured connection, including ACL and preferences when returned.",
    inputSchema: emptyInputSchema,
    outputSchema: appUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_metadata",
    operationType: "read",
    description: "Get EspoCRM application metadata, optionally narrowed to one metadata path.",
    inputSchema: getMetadataInputSchema,
    outputSchema: metadataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    description: "List EspoCRM records for an entity type with optional pagination, sorting, and where clauses.",
    inputSchema: listRecordsInputSchema,
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    description: "Get one EspoCRM record by entity type and record identifier.",
    inputSchema: s.object("The input payload for reading one EspoCRM record.", {
      entityType: entityTypeField,
      recordId: recordIdField,
    }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    description: "Create one EspoCRM record for the specified entity type.",
    inputSchema: s.object("The input payload for creating one EspoCRM record.", {
      entityType: entityTypeField,
      data: recordDataSchema,
    }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    description: "Update selected fields on one EspoCRM record.",
    inputSchema: s.object("The input payload for updating one EspoCRM record.", {
      entityType: entityTypeField,
      recordId: recordIdField,
      data: recordDataSchema,
    }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_record",
    operationType: "destructive",
    description: "Delete one EspoCRM record by entity type and record identifier.",
    inputSchema: s.object("The input payload for deleting one EspoCRM record.", {
      entityType: entityTypeField,
      recordId: recordIdField,
    }),
    outputSchema: deleteRecordOutputSchema,
  }),
];
