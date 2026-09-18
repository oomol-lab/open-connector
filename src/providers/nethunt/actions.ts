import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nethunt";

const idSchema = (description: string): JsonSchema => s.nonEmptyString(description);
const dateTimeSchema = s.dateTime("ISO-formatted UTC timestamp used as the lower bound.");
const limitSchema = s.positiveInteger("Maximum number of NetHunt items to return.");
const fieldValueSchema = s.unknown("A NetHunt CRM field value.");
const fieldsSchema = s.record(
  "NetHunt field values keyed by the CRM field names configured in the target folder.",
  fieldValueSchema,
);
const fieldActionsSchema = s.record(
  "NetHunt field update actions keyed by CRM field name.",
  s.object(
    "One NetHunt field update action.",
    {
      overwrite: s.boolean("Whether NetHunt should clear the existing field value before adding values."),
      remove: fieldValueSchema,
      add: fieldValueSchema,
    },
    { optional: ["overwrite", "remove", "add"] },
  ),
);

const folderSchema = s.looseRequiredObject("A NetHunt folder returned by the Integration API.", {
  id: s.string("NetHunt folder ID."),
  name: s.string("NetHunt folder name."),
});
const fieldSchema = s.looseRequiredObject("A NetHunt folder field returned by the Integration API.", {
  name: s.string("NetHunt folder field name."),
});
const recordSchema = s.looseRequiredObject(
  "A NetHunt record returned by the Integration API.",
  {
    recordId: s.string("NetHunt record ID."),
    createdAt: s.string("Record creation timestamp returned by NetHunt."),
    updatedAt: s.string("Last record update timestamp returned by NetHunt."),
    fields: fieldsSchema,
  },
  { optional: ["createdAt", "updatedAt", "fields"] },
);
const commentSchema = s.looseRequiredObject(
  "A NetHunt record comment returned by the Integration API.",
  {
    commentId: s.string("NetHunt comment ID."),
    recordId: s.string("NetHunt record ID associated with the comment."),
    createdAt: s.string("Comment creation timestamp returned by NetHunt."),
    text: s.string("Comment text."),
  },
  { optional: ["recordId", "createdAt", "text"] },
);
const callLogSchema = s.looseRequiredObject(
  "A NetHunt call log returned by the Integration API.",
  {
    callLogId: s.string("NetHunt call log ID."),
    recordId: s.string("NetHunt record ID associated with the call log."),
    createdAt: s.string("Call log creation timestamp returned by NetHunt."),
    text: s.string("Call log text."),
    duration: s.number("Call duration in minutes."),
    time: s.string("Call start timestamp returned by NetHunt."),
    endTime: s.string("Call end timestamp returned by NetHunt."),
  },
  { optional: ["recordId", "createdAt", "text", "duration", "time", "endTime"] },
);
const recordChangeSchema = s.looseRequiredObject(
  "A NetHunt record change returned by the Integration API.",
  {
    id: s.string("Internal NetHunt change identifier."),
    recordId: s.string("NetHunt record ID."),
    time: s.string("Record change timestamp returned by NetHunt."),
    user: s.looseObject("User who made the record change."),
    recordAction: s.stringEnum("NetHunt record action type.", ["CREATE", "UPDATE", "DELETE"]),
    fieldActions: fieldActionsSchema,
  },
  { optional: ["id", "user", "fieldActions"] },
);
const authUserSchema = s.looseRequiredObject("The NetHunt user returned by the auth-test endpoint.", {
  personalName: s.string("NetHunt user personal name."),
  emailAddress: s.email("NetHunt user email address."),
});

const folderIdInputSchema = s.actionInput(
  {
    folderId: idSchema("NetHunt folder ID."),
  },
  ["folderId"],
  "Input parameters for a NetHunt folder endpoint.",
);

const sinceLimitInputSchema = s.actionInput(
  {
    folderId: idSchema("NetHunt folder ID."),
    since: dateTimeSchema,
    limit: limitSchema,
  },
  ["folderId"],
  "Input parameters for a NetHunt recent-item endpoint.",
);

const fieldNameArraySchema = s.stringArray("NetHunt field names to limit returned updates.", {
  minItems: 1,
  itemDescription: "A NetHunt field name.",
});

const updatedRecordInputSchema = s.actionInput(
  {
    folderId: idSchema("NetHunt folder ID."),
    fieldName: fieldNameArraySchema,
    since: dateTimeSchema,
    limit: limitSchema,
  },
  ["folderId"],
  "Input parameters for listing recently updated NetHunt records.",
);

const recordChangeInputSchema = s.actionInput(
  {
    folderId: idSchema("NetHunt folder ID."),
    recordId: idSchema("Optional NetHunt record ID used to narrow changes to one record."),
    fieldName: fieldNameArraySchema,
    since: dateTimeSchema,
    limit: limitSchema,
  },
  ["folderId"],
  "Input parameters for listing NetHunt record changes.",
);

const findRecordsInputSchema = {
  ...s.actionInput(
    {
      folderId: idSchema("NetHunt folder ID."),
      recordId: idSchema("NetHunt record ID to fetch when available."),
      query: idSchema("NetHunt advanced search query."),
      limit: limitSchema,
    },
    ["folderId"],
    "Input parameters for finding NetHunt records by record ID or advanced search query.",
  ),
  anyOf: [{ required: ["recordId"] }, { required: ["query"] }],
} satisfies JsonSchema;

const createRecordInputSchema = s.actionInput(
  {
    folderId: idSchema("NetHunt folder ID to create the record in."),
    timeZone: idSchema("User time zone sent to NetHunt when creating the record."),
    fields: fieldsSchema,
  },
  ["folderId", "timeZone", "fields"],
  "Input parameters for creating a NetHunt record.",
);

const updateRecordInputSchema = s.actionInput(
  {
    recordId: idSchema("NetHunt record ID to update."),
    overwrite: s.boolean("Default overwrite behavior for NetHunt field actions."),
    fieldActions: fieldActionsSchema,
  },
  ["recordId", "fieldActions"],
  "Input parameters for updating a NetHunt record.",
);

const recordIdInputSchema = s.actionInput(
  {
    recordId: idSchema("NetHunt record ID."),
  },
  ["recordId"],
  "Input parameters for a NetHunt record endpoint.",
);

const createCommentInputSchema = s.actionInput(
  {
    recordId: idSchema("NetHunt record ID to comment on."),
    text: idSchema("Comment text."),
  },
  ["recordId", "text"],
  "Input parameters for creating a NetHunt comment.",
);

const createCallLogInputSchema = s.actionInput(
  {
    recordId: idSchema("NetHunt record ID to attach the call log to."),
    text: idSchema("Call log text."),
    time: s.dateTime("ISO-formatted UTC timestamp when the call started."),
    duration: s.number("Call duration in minutes.", { minimum: 0 }),
  },
  ["recordId", "text"],
  "Input parameters for creating a NetHunt call log.",
);

export const nethuntActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_readable_folders",
    operationType: "read",
    description: "List NetHunt folders that the connected user can read.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing readable NetHunt folders."),
    outputSchema: s.actionOutput(
      {
        folders: s.array("Readable NetHunt folders.", folderSchema),
      },
      "Readable NetHunt folder list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_writable_folders",
    operationType: "read",
    description: "List NetHunt folders that the connected user can create records in.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing writable NetHunt folders."),
    outputSchema: s.actionOutput(
      {
        folders: s.array("Writable NetHunt folders.", folderSchema),
      },
      "Writable NetHunt folder list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_folder_fields",
    operationType: "read",
    description: "List fields configured for a NetHunt folder.",
    inputSchema: folderIdInputSchema,
    outputSchema: s.actionOutput(
      {
        fields: s.array("Fields configured for the NetHunt folder.", fieldSchema),
      },
      "NetHunt folder field list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "find_records",
    operationType: "read",
    description: "Find NetHunt records by record ID or advanced search query.",
    inputSchema: findRecordsInputSchema,
    outputSchema: s.actionOutput(
      {
        records: s.array("NetHunt records matching the search input.", recordSchema),
      },
      "NetHunt record search response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_new_records",
    operationType: "read",
    description: "List NetHunt records created after an optional timestamp.",
    inputSchema: sinceLimitInputSchema,
    outputSchema: s.actionOutput(
      {
        records: s.array("Recently created NetHunt records.", recordSchema),
      },
      "Recently created NetHunt record list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_updated_records",
    operationType: "read",
    description: "List NetHunt records updated after an optional timestamp.",
    inputSchema: updatedRecordInputSchema,
    outputSchema: s.actionOutput(
      {
        records: s.array("Recently updated NetHunt records.", recordSchema),
      },
      "Recently updated NetHunt record list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_record_changes",
    operationType: "read",
    description: "List NetHunt record changes after an optional timestamp.",
    inputSchema: recordChangeInputSchema,
    outputSchema: s.actionOutput(
      {
        changes: s.array("NetHunt record changes.", recordChangeSchema),
      },
      "NetHunt record change list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    description: "Create a NetHunt record in a folder with field values.",
    inputSchema: createRecordInputSchema,
    outputSchema: s.actionOutput({ record: recordSchema }, "NetHunt create-record response."),
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    description: "Update a NetHunt record with field actions.",
    inputSchema: updateRecordInputSchema,
    outputSchema: s.actionOutput({ record: recordSchema }, "NetHunt update-record response."),
  }),
  defineProviderAction(service, {
    name: "delete_record",
    operationType: "destructive",
    description: "Delete a NetHunt record.",
    inputSchema: recordIdInputSchema,
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the delete request completed successfully."),
      },
      "NetHunt delete-record response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_comment",
    operationType: "write",
    description: "Create a NetHunt comment on a record.",
    inputSchema: createCommentInputSchema,
    outputSchema: s.actionOutput({ comment: commentSchema }, "NetHunt create-comment response."),
  }),
  defineProviderAction(service, {
    name: "list_new_comments",
    operationType: "read",
    description: "List NetHunt record comments created after an optional timestamp.",
    inputSchema: sinceLimitInputSchema,
    outputSchema: s.actionOutput(
      {
        comments: s.array("Recently created NetHunt comments.", commentSchema),
      },
      "Recently created NetHunt comment list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_call_log",
    operationType: "write",
    description: "Create a NetHunt call log on a record.",
    inputSchema: createCallLogInputSchema,
    outputSchema: s.actionOutput({ callLog: callLogSchema }, "NetHunt create-call-log response."),
  }),
  defineProviderAction(service, {
    name: "list_new_call_logs",
    operationType: "read",
    description: "List NetHunt call logs created after an optional timestamp.",
    inputSchema: sinceLimitInputSchema,
    outputSchema: s.actionOutput(
      {
        callLogs: s.array("Recently created NetHunt call logs.", callLogSchema),
      },
      "Recently created NetHunt call log list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "auth_test",
    operationType: "read",
    description: "Verify the NetHunt credentials and return the connected user.",
    inputSchema: s.actionInput({}, [], "Input parameters for verifying NetHunt credentials."),
    outputSchema: s.actionOutput({ user: authUserSchema }, "NetHunt auth-test response."),
  }),
];
