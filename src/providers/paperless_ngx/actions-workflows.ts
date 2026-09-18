import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { extendObject } from "./schemas.ts";
import {
  additionalFiltersInputField,
  deletedOutputSchema,
  idArrayField,
  idField,
  integerEnum,
  pageInputFields,
  paginatedOutputSchema,
  workflowSchema,
} from "./schemas.ts";

const service = "paperless_ngx";

const workflowTriggerTypeValues = [1, 2, 3, 4];
const workflowTriggerTypeDescription =
  "Trigger type: 1 consumption started (runs before the document is stored and requires filter_filename, filter_path or filter_mailrule), 2 document added, 3 document updated, 4 scheduled (fires relative to the date field selected by schedule_date_field).";

const workflowTriggerSourceValues = [1, 2, 3, 4];
const workflowTriggerSourceDescription = "Document source: 1 consume folder, 2 API upload, 3 mail fetch, 4 web UI.";

const workflowTriggerMatchingValues = [0, 1, 2, 3, 4, 5];
const workflowTriggerMatchingDescription =
  "Matching algorithm applied to the document content: 0 none, 1 any word, 2 all words, 3 exact match, 4 regular expression, 5 fuzzy word. Defaults to 0.";

const scheduleDateFieldValues = ["added", "created", "modified", "custom_field"];
const scheduleDateFieldDescription =
  "Date field the scheduled trigger is measured from: added, created, modified or custom_field (then schedule_date_custom_field is required). Defaults to added.";

const workflowActionTypeValues = [1, 2, 3, 4, 5, 6, 7, 8];
const workflowActionTypeDescription =
  "Action type: 1 assignment, 2 removal, 3 email (email is required), 4 webhook (webhook is required), 5 password removal (passwords is required), 6 move to trash, 7 remote OCR (the workflow needs a consumption started trigger), 8 apply AI suggestions (ai_suggestion_fields is required and the workflow needs a trigger other than consumption started). Defaults to 1.";

const aiSuggestionFieldValues = ["title", "tags", "correspondent", "document_type", "storage_path", "created"];
const aiSuggestionFieldDescription =
  "Document field an AI suggestion may be applied to: title, tags, correspondent, document_type, storage_path or created.";

const nestedIdDescription = "Id of an existing object to update in place. Omit or pass null to create a new one.";

const workflowTriggerInputFields = {
  type: integerEnum(workflowTriggerTypeDescription, workflowTriggerTypeValues),
  sources: s.array(
    "Document sources the trigger reacts to; only evaluated by consumption started (1) and document added (2) triggers. Defaults to [1, 2, 3].",
    integerEnum(workflowTriggerSourceDescription, workflowTriggerSourceValues),
  ),
  filter_path: s.nullableString(
    "Only match documents whose consumption path matches this pattern; * wildcards are allowed and matching is case insensitive. Empty strings are stored as null.",
  ),
  filter_filename: s.nullableString(
    "Only match documents whose file name matches this pattern, for example *.pdf or *invoice*; matching is case insensitive. Empty strings are stored as null.",
  ),
  filter_mailrule: s.nullableInteger(
    "Id of the mail rule the document must have been fetched by, or null for any source.",
  ),
  matching_algorithm: integerEnum(workflowTriggerMatchingDescription, workflowTriggerMatchingValues),
  match: s.string(
    "Text or pattern compared against the document content using matching_algorithm. Defaults to an empty string.",
  ),
  is_insensitive: s.boolean("Whether content matching ignores case. Defaults to true."),
  filter_has_tags: idArrayField("Ids of tags; the document must carry at least one of them.", "A tag id."),
  filter_has_all_tags: idArrayField("Ids of tags; the document must carry all of them.", "A tag id."),
  filter_has_not_tags: idArrayField("Ids of tags; the document must not carry any of them.", "A tag id."),
  filter_custom_field_query: s.nullableString(
    "JSON-encoded custom field query expression using the same syntax as the custom_field_query filter of list_documents, or null. Empty strings are stored as null.",
  ),
  filter_has_any_correspondents: idArrayField(
    "Ids of correspondents; the document must have one of them.",
    "A correspondent id.",
  ),
  filter_has_not_correspondents: idArrayField(
    "Ids of correspondents the document must not have.",
    "A correspondent id.",
  ),
  filter_has_any_document_types: idArrayField(
    "Ids of document types; the document must have one of them.",
    "A document type id.",
  ),
  filter_has_not_document_types: idArrayField(
    "Ids of document types the document must not have.",
    "A document type id.",
  ),
  filter_has_any_storage_paths: idArrayField(
    "Ids of storage paths; the document must use one of them.",
    "A storage path id.",
  ),
  filter_has_not_storage_paths: idArrayField("Ids of storage paths the document must not use.", "A storage path id."),
  filter_has_correspondent: s.nullableInteger("Id of the correspondent the document must have, or null for any."),
  filter_has_document_type: s.nullableInteger("Id of the document type the document must have, or null for any."),
  filter_has_storage_path: s.nullableInteger("Id of the storage path the document must use, or null for any."),
  schedule_offset_days: s.integer(
    "Number of days after the selected date field at which a scheduled (4) trigger fires; negative values fire before it. Defaults to 0.",
  ),
  schedule_is_recurring: s.boolean(
    "Whether a scheduled (4) trigger fires again every schedule_recurring_interval_days. Defaults to false.",
  ),
  schedule_recurring_interval_days: s.positiveInteger(
    "Number of days between recurring runs of a scheduled (4) trigger, at least 1. Defaults to 1.",
  ),
  schedule_date_field: s.stringEnum(scheduleDateFieldDescription, scheduleDateFieldValues),
  schedule_date_custom_field: s.nullableInteger(
    "Id of the date custom field used when schedule_date_field is custom_field, or null.",
  ),
};

const workflowTriggerOptionalInputFields = Object.keys(workflowTriggerInputFields).filter((field) => field !== "type");

const workflowTriggerNestedInputSchema = s.object(
  "A workflow trigger. Include id to update an existing trigger in place; omit it to create a new one.",
  {
    id: s.nullableInteger(nestedIdDescription),
    ...workflowTriggerInputFields,
  },
  { optional: ["id", ...workflowTriggerOptionalInputFields] },
);

export const workflowTriggerSchema: JsonSchema = s.looseObject("A Paperless-ngx workflow trigger.", {
  id: s.integer("The trigger id."),
  type: s.integer(workflowTriggerTypeDescription),
  sources: s.array("Document sources the trigger reacts to.", s.integer(workflowTriggerSourceDescription)),
  filter_path: s.nullableString("Consumption path pattern, or null."),
  filter_filename: s.nullableString("File name pattern, or null."),
  filter_mailrule: s.nullableInteger("Id of the required mail rule, or null."),
  matching_algorithm: s.integer(workflowTriggerMatchingDescription),
  match: s.string("Text or pattern used by the matching algorithm."),
  is_insensitive: s.boolean("Whether content matching ignores case."),
  filter_has_tags: s.array("Ids of tags the document must carry at least one of.", s.integer("A tag id.")),
  filter_has_all_tags: s.array("Ids of tags the document must carry all of.", s.integer("A tag id.")),
  filter_has_not_tags: s.array("Ids of tags the document must not carry.", s.integer("A tag id.")),
  filter_custom_field_query: s.nullableString("JSON-encoded custom field query expression, or null."),
  filter_has_any_correspondents: s.array(
    "Ids of correspondents the document must have one of.",
    s.integer("A correspondent id."),
  ),
  filter_has_not_correspondents: s.array(
    "Ids of correspondents the document must not have.",
    s.integer("A correspondent id."),
  ),
  filter_has_any_document_types: s.array(
    "Ids of document types the document must have one of.",
    s.integer("A document type id."),
  ),
  filter_has_not_document_types: s.array(
    "Ids of document types the document must not have.",
    s.integer("A document type id."),
  ),
  filter_has_any_storage_paths: s.array(
    "Ids of storage paths the document must use one of.",
    s.integer("A storage path id."),
  ),
  filter_has_not_storage_paths: s.array(
    "Ids of storage paths the document must not use.",
    s.integer("A storage path id."),
  ),
  filter_has_correspondent: s.nullableInteger("Id of the required correspondent, or null."),
  filter_has_document_type: s.nullableInteger("Id of the required document type, or null."),
  filter_has_storage_path: s.nullableInteger("Id of the required storage path, or null."),
  schedule_offset_days: s.integer("Day offset of a scheduled trigger from its date field."),
  schedule_is_recurring: s.boolean("Whether a scheduled trigger repeats."),
  schedule_recurring_interval_days: s.integer("Days between recurring scheduled runs."),
  schedule_date_field: s.string(scheduleDateFieldDescription),
  schedule_date_custom_field: s.nullableInteger("Id of the date custom field used by the schedule, or null."),
});

const workflowActionEmailInputSchema = s.object(
  "Email settings for an email (type 3) action. Paperless-ngx must have outgoing email configured.",
  {
    id: s.nullableInteger(nestedIdDescription),
    subject: s.nonEmptyString(
      "Email subject; may contain placeholders such as {doc_title} or {correspondent} as documented for workflow templates.",
    ),
    body: s.nonEmptyString("Email body; may contain the same placeholders as subject."),
    to: s.nonEmptyString("Comma separated recipient email addresses."),
    include_document: s.boolean("Whether to attach the document file to the email. Defaults to false."),
  },
  { optional: ["id", "include_document"] },
);

const webhookHeadersDescription =
  "HTTP headers sent with the webhook request, keyed by header name, or null. They may carry secrets such as an Authorization value and are redacted from connector logs.";

const workflowActionWebhookInputSchema = s.object(
  "Webhook settings for a webhook (type 4) action.",
  {
    id: s.nullableInteger(nestedIdDescription),
    url: s.url("Destination URL of the webhook. Paperless-ngx validates it as an HTTP(S) URL."),
    use_params: s.boolean(
      "When true, send params as form fields (or JSON when as_json is true); when false, send body instead. Defaults to true.",
    ),
    as_json: s.boolean(
      "When true and use_params is true, send params as a JSON payload instead of form fields. Defaults to false.",
    ),
    params: s.nullable(
      s.record(
        "Parameters sent when use_params is true, keyed by name; values may contain workflow placeholders. Null sends none.",
        s.unknown("A parameter value."),
      ),
    ),
    body: s.nullableString(
      "Raw request body sent when use_params is false; may contain workflow placeholders. Null sends none.",
    ),
    headers: s.nullable(s.record(webhookHeadersDescription, s.unknown("A header value."))),
    include_document: s.boolean("Whether to attach the document file to the webhook request. Defaults to false."),
  },
  { optional: ["id", "use_params", "as_json", "params", "body", "headers", "include_document"] },
);

const workflowActionInputFields = {
  type: integerEnum(workflowActionTypeDescription, workflowActionTypeValues),
  assign_title: s.nullableString(
    "Jinja2 template for the new document title, for example {{ correspondent }} - {{ created_year }}; see the workflow template documentation. Null or an empty string leaves the title unchanged.",
  ),
  assign_tags: s.nullable(idArrayField("Ids of tags to add to the document.", "A tag id.")),
  assign_correspondent: s.nullableInteger("Id of the correspondent to assign, or null."),
  assign_document_type: s.nullableInteger("Id of the document type to assign, or null."),
  assign_storage_path: s.nullableInteger("Id of the storage path to assign, or null."),
  assign_owner: s.nullableInteger("Id of the user to set as owner, or null."),
  assign_view_users: idArrayField("Ids of users granted view permission.", "A user id."),
  assign_view_groups: idArrayField("Ids of groups granted view permission.", "A group id."),
  assign_change_users: idArrayField("Ids of users granted change permission.", "A user id."),
  assign_change_groups: idArrayField("Ids of groups granted change permission.", "A group id."),
  assign_custom_fields: idArrayField("Ids of custom fields to attach to the document.", "A custom field id."),
  assign_custom_fields_values: s.nullable(
    s.record(
      "Values for the attached custom fields keyed by custom field id (as a string); an empty string is stored as null. Fields listed in assign_custom_fields without a value are attached empty.",
      s.unknown("A custom field value in the field's data type."),
    ),
  ),
  remove_all_tags: s.boolean("Whether to remove every tag. Defaults to false."),
  remove_tags: idArrayField("Ids of tags to remove.", "A tag id."),
  remove_all_correspondents: s.boolean("Whether to clear the correspondent. Defaults to false."),
  remove_correspondents: idArrayField("Ids of correspondents to clear when currently assigned.", "A correspondent id."),
  remove_all_document_types: s.boolean("Whether to clear the document type. Defaults to false."),
  remove_document_types: idArrayField("Ids of document types to clear when currently assigned.", "A document type id."),
  remove_all_storage_paths: s.boolean("Whether to clear the storage path. Defaults to false."),
  remove_storage_paths: idArrayField("Ids of storage paths to clear when currently assigned.", "A storage path id."),
  remove_custom_fields: idArrayField("Ids of custom fields to detach.", "A custom field id."),
  remove_all_custom_fields: s.boolean("Whether to detach every custom field. Defaults to false."),
  remove_all_owners: s.boolean("Whether to clear the owner. Defaults to false."),
  remove_owners: idArrayField("Ids of users to clear as owner when they own the document.", "A user id."),
  remove_all_permissions: s.boolean("Whether to remove all object permissions. Defaults to false."),
  remove_view_users: idArrayField("Ids of users whose view permission is removed.", "A user id."),
  remove_view_groups: idArrayField("Ids of groups whose view permission is removed.", "A group id."),
  remove_change_users: idArrayField("Ids of users whose change permission is removed.", "A user id."),
  remove_change_groups: idArrayField("Ids of groups whose change permission is removed.", "A group id."),
  email: s.nullable(workflowActionEmailInputSchema),
  webhook: s.nullable(workflowActionWebhookInputSchema),
  passwords: s.nullable(
    s.array(
      "Passwords to try when removing PDF protection; required and non-empty for password removal (type 5) actions. Redacted from connector logs.",
      s.nonEmptyString("A PDF password."),
    ),
  ),
  ai_suggestion_fields: s.nullable(
    s.array(
      "Which AI-suggested fields to apply; required and non-empty for apply AI suggestions (type 8) actions.",
      s.stringEnum(aiSuggestionFieldDescription, aiSuggestionFieldValues),
    ),
  ),
  ai_create_missing: s.boolean(
    "Whether apply AI suggestions actions create suggested tags, correspondents, document types and storage paths that do not exist yet instead of skipping them. Defaults to false.",
  ),
  ai_overwrite_existing: s.boolean(
    "Whether apply AI suggestions actions overwrite fields that already have a value; tags are always added, never replaced. Defaults to false.",
  ),
};

const workflowActionOptionalInputFields = Object.keys(workflowActionInputFields);

const workflowActionNestedInputSchema = s.object(
  "A workflow action. Include id to update an existing action in place; omit it to create a new one. Actions run in array order.",
  {
    id: s.nullableInteger(nestedIdDescription),
    ...workflowActionInputFields,
  },
  { optional: ["id", ...workflowActionOptionalInputFields] },
);

const workflowActionEmailSchema = s.looseObject("Email settings of an email action.", {
  id: s.integer("The email settings id."),
  subject: s.string("Email subject template."),
  body: s.string("Email body template."),
  to: s.string("Comma separated recipient email addresses."),
  include_document: s.boolean("Whether the document file is attached."),
});

const workflowActionWebhookSchema = s.looseObject("Webhook settings of a webhook action.", {
  id: s.integer("The webhook settings id."),
  url: s.string("Destination URL of the webhook."),
  use_params: s.boolean("Whether params are sent instead of body."),
  as_json: s.boolean("Whether params are sent as JSON."),
  params: s.nullable(s.record("Parameters sent with the webhook, or null.", s.unknown("A parameter value."))),
  body: s.nullableString("Raw request body, or null."),
  headers: s.nullable(s.record(webhookHeadersDescription, s.unknown("A header value."))),
  include_document: s.boolean("Whether the document file is attached."),
});

export const workflowActionSchema: JsonSchema = s.looseObject("A Paperless-ngx workflow action.", {
  id: s.integer("The action id."),
  type: s.integer(workflowActionTypeDescription),
  assign_title: s.nullableString("Title template, or null."),
  assign_tags: s.array("Ids of tags added to the document.", s.integer("A tag id.")),
  assign_correspondent: s.nullableInteger("Id of the assigned correspondent, or null."),
  assign_document_type: s.nullableInteger("Id of the assigned document type, or null."),
  assign_storage_path: s.nullableInteger("Id of the assigned storage path, or null."),
  assign_owner: s.nullableInteger("Id of the assigned owner, or null."),
  assign_view_users: s.array("Ids of users granted view permission.", s.integer("A user id.")),
  assign_view_groups: s.array("Ids of groups granted view permission.", s.integer("A group id.")),
  assign_change_users: s.array("Ids of users granted change permission.", s.integer("A user id.")),
  assign_change_groups: s.array("Ids of groups granted change permission.", s.integer("A group id.")),
  assign_custom_fields: s.array("Ids of custom fields attached to the document.", s.integer("A custom field id.")),
  assign_custom_fields_values: s.nullable(
    s.record("Custom field values keyed by custom field id, or null.", s.unknown("A custom field value.")),
  ),
  remove_all_tags: s.boolean("Whether every tag is removed."),
  remove_tags: s.array("Ids of tags removed.", s.integer("A tag id.")),
  remove_all_correspondents: s.boolean("Whether the correspondent is cleared."),
  remove_correspondents: s.array("Ids of correspondents cleared when assigned.", s.integer("A correspondent id.")),
  remove_all_document_types: s.boolean("Whether the document type is cleared."),
  remove_document_types: s.array("Ids of document types cleared when assigned.", s.integer("A document type id.")),
  remove_all_storage_paths: s.boolean("Whether the storage path is cleared."),
  remove_storage_paths: s.array("Ids of storage paths cleared when assigned.", s.integer("A storage path id.")),
  remove_custom_fields: s.array("Ids of custom fields detached.", s.integer("A custom field id.")),
  remove_all_custom_fields: s.boolean("Whether every custom field is detached."),
  remove_all_owners: s.boolean("Whether the owner is cleared."),
  remove_owners: s.array("Ids of users cleared as owner.", s.integer("A user id.")),
  remove_all_permissions: s.boolean("Whether all object permissions are removed."),
  remove_view_users: s.array("Ids of users whose view permission is removed.", s.integer("A user id.")),
  remove_view_groups: s.array("Ids of groups whose view permission is removed.", s.integer("A group id.")),
  remove_change_users: s.array("Ids of users whose change permission is removed.", s.integer("A user id.")),
  remove_change_groups: s.array("Ids of groups whose change permission is removed.", s.integer("A group id.")),
  email: s.nullable(workflowActionEmailSchema),
  webhook: s.nullable(workflowActionWebhookSchema),
  passwords: s.nullable(
    s.array(
      "Passwords tried by password removal actions, or null. Redacted from connector logs.",
      s.string("A PDF password."),
    ),
  ),
  ai_suggestion_fields: s.nullable(
    s.array("AI-suggested fields applied by the action, or null.", s.string(aiSuggestionFieldDescription)),
  ),
  ai_create_missing: s.boolean("Whether suggested objects that do not exist are created."),
  ai_overwrite_existing: s.boolean("Whether existing field values are overwritten."),
});

export const workflowDetailSchema: JsonSchema = extendObject(
  "A Paperless-ngx workflow with its triggers and actions.",
  workflowSchema,
  {
    triggers: s.array("Triggers that start the workflow.", workflowTriggerSchema),
    actions: s.array("Actions the workflow performs, in execution order.", workflowActionSchema),
  },
  { optional: ["triggers", "actions"] },
);

const workflowNameField = s.nonEmptyString("Workflow name, unique across workflows (max 256 characters).");
const workflowOrderField = s.integer("Evaluation order among workflows; lower values run first. Defaults to 0.");
const workflowEnabledField = s.boolean("Whether the workflow is active. Defaults to true.");
const workflowTriggersField = s.array(
  "Triggers that start the workflow. Each entry takes the fields of create_workflow_trigger; include id to reuse an existing trigger.",
  workflowTriggerNestedInputSchema,
);
const workflowActionsField = s.array(
  "Actions performed when a trigger matches, run in array order. Each entry takes the fields of create_workflow_action; include id to reuse an existing action.",
  workflowActionNestedInputSchema,
);

const listInputFields = {
  page: pageInputFields.page,
  page_size: pageInputFields.page_size,
  additional_filters: additionalFiltersInputField,
};

const workflowIdField = idField("The workflow id.");
const triggerIdField = idField("The workflow trigger id.");
const actionIdField = idField("The workflow action id.");

const detachedObjectWarning =
  "Objects not attached to any workflow are deleted automatically the next time any workflow is updated, so attach it promptly through update_workflow or create_workflow.";

export const paperlessNgxWorkflowActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workflows",
    operationType: "read",
    description:
      "List workflows with their nested triggers and actions, ordered by order. The endpoint supports only pagination; it has no filters or ordering options. Requires the view_workflow permission.",
    requiredScopes: [],
    inputSchema: s.object("Pagination for the workflow list.", listInputFields, {
      optional: Object.keys(listInputFields),
    }),
    outputSchema: paginatedOutputSchema("A page of workflows.", workflowDetailSchema),
  }),
  defineProviderAction(service, {
    name: "get_workflow",
    operationType: "read",
    description: "Get one workflow by id, including its triggers and actions. Requires the view_workflow permission.",
    requiredScopes: [],
    inputSchema: s.object("The workflow to read.", { id: workflowIdField }),
    outputSchema: workflowDetailSchema,
  }),
  defineProviderAction(service, {
    name: "create_workflow",
    operationType: "write",
    description:
      "Create a workflow with its triggers and actions in one call. Nested triggers and actions without an id are created; entries with an id update that existing trigger or action in place. Remote OCR actions need a consumption started trigger and apply AI suggestions actions need a trigger of another type. Requires the add_workflow permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "The workflow to create.",
      {
        name: workflowNameField,
        order: workflowOrderField,
        enabled: workflowEnabledField,
        triggers: workflowTriggersField,
        actions: workflowActionsField,
      },
      { optional: ["order", "enabled"] },
    ),
    outputSchema: workflowDetailSchema,
  }),
  defineProviderAction(service, {
    name: "update_workflow",
    operationType: "destructive",
    description:
      "Partially update a workflow. Only the provided fields are sent. When triggers or actions is provided it replaces the whole set: entries with an id are updated in place, entries without an id are created, and triggers or actions left out are detached and deleted. Requires the change_workflow permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "The workflow fields to update.",
      {
        id: workflowIdField,
        name: workflowNameField,
        order: workflowOrderField,
        enabled: workflowEnabledField,
        triggers: workflowTriggersField,
        actions: workflowActionsField,
      },
      { optional: ["name", "order", "enabled", "triggers", "actions"] },
    ),
    outputSchema: workflowDetailSchema,
  }),
  defineProviderAction(service, {
    name: "delete_workflow",
    operationType: "destructive",
    description:
      "Delete a workflow. Its triggers and actions are removed the next time any workflow is updated. Requires the delete_workflow permission.",
    requiredScopes: [],
    inputSchema: s.object("The workflow to delete.", { id: workflowIdField }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted workflow."),
  }),

  defineProviderAction(service, {
    name: "list_workflow_triggers",
    operationType: "read",
    description:
      "List workflow triggers across all workflows. The endpoint supports only pagination; it has no filters or ordering options. Requires the view_workflowtrigger permission.",
    requiredScopes: [],
    inputSchema: s.object("Pagination for the trigger list.", listInputFields, {
      optional: Object.keys(listInputFields),
    }),
    outputSchema: paginatedOutputSchema("A page of workflow triggers.", workflowTriggerSchema),
  }),
  defineProviderAction(service, {
    name: "get_workflow_trigger",
    operationType: "read",
    description: "Get one workflow trigger by id. Requires the view_workflowtrigger permission.",
    requiredScopes: [],
    inputSchema: s.object("The trigger to read.", { id: triggerIdField }),
    outputSchema: workflowTriggerSchema,
  }),
  defineProviderAction(service, {
    name: "create_workflow_trigger",
    operationType: "write",
    description: `Create a standalone workflow trigger. Consumption started (type 1) triggers need filter_filename, filter_path or filter_mailrule. ${detachedObjectWarning} Requires the add_workflowtrigger permission.`,
    requiredScopes: [],
    followUpActions: ["paperless_ngx.update_workflow"],
    inputSchema: s.object("The trigger to create.", workflowTriggerInputFields, {
      optional: workflowTriggerOptionalInputFields,
    }),
    outputSchema: workflowTriggerSchema,
  }),
  defineProviderAction(service, {
    name: "update_workflow_trigger",
    operationType: "write",
    description:
      "Partially update a workflow trigger. Only the provided fields are sent. When the trigger is (or becomes) a consumption started trigger, Paperless-ngx requires filter_filename, filter_path or filter_mailrule in the same request even if unchanged. Requires the change_workflowtrigger permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "The trigger fields to update.",
      { id: triggerIdField, ...workflowTriggerInputFields },
      { optional: Object.keys(workflowTriggerInputFields) },
    ),
    outputSchema: workflowTriggerSchema,
  }),
  defineProviderAction(service, {
    name: "delete_workflow_trigger",
    operationType: "destructive",
    description:
      "Delete a workflow trigger, detaching it from any workflow that used it. Requires the delete_workflowtrigger permission.",
    requiredScopes: [],
    inputSchema: s.object("The trigger to delete.", { id: triggerIdField }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted workflow trigger."),
  }),

  defineProviderAction(service, {
    name: "list_workflow_actions",
    operationType: "read",
    description:
      "List workflow actions across all workflows. The endpoint supports only pagination; it has no filters or ordering options. Requires the view_workflowaction permission.",
    requiredScopes: [],
    inputSchema: s.object("Pagination for the action list.", listInputFields, {
      optional: Object.keys(listInputFields),
    }),
    outputSchema: paginatedOutputSchema("A page of workflow actions.", workflowActionSchema),
  }),
  defineProviderAction(service, {
    name: "get_workflow_action",
    operationType: "read",
    description: "Get one workflow action by id. Requires the view_workflowaction permission.",
    requiredScopes: [],
    inputSchema: s.object("The action to read.", { id: actionIdField }),
    outputSchema: workflowActionSchema,
  }),
  defineProviderAction(service, {
    name: "create_workflow_action",
    operationType: "write",
    description: `Create a standalone workflow action. Email (3), webhook (4), password removal (5) and apply AI suggestions (8) actions require their email, webhook, passwords or ai_suggestion_fields data. ${detachedObjectWarning} Requires the add_workflowaction permission.`,
    requiredScopes: [],
    followUpActions: ["paperless_ngx.update_workflow"],
    inputSchema: s.object("The action to create.", workflowActionInputFields, {
      optional: workflowActionOptionalInputFields,
    }),
    outputSchema: workflowActionSchema,
  }),
  defineProviderAction(service, {
    name: "update_workflow_action",
    operationType: "write",
    description:
      "Partially update a workflow action. Only the provided fields are sent; nested email and webhook objects replace the stored settings. Requires the change_workflowaction permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "The action fields to update.",
      { id: actionIdField, ...workflowActionInputFields },
      { optional: workflowActionOptionalInputFields },
    ),
    outputSchema: workflowActionSchema,
  }),
  defineProviderAction(service, {
    name: "delete_workflow_action",
    operationType: "destructive",
    description:
      "Delete a workflow action, detaching it from any workflow that used it. Requires the delete_workflowaction permission.",
    requiredScopes: [],
    inputSchema: s.object("The action to delete.", { id: actionIdField }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted workflow action."),
  }),
];
