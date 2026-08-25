import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "safetyculture";

const rawObjectSchema = s.looseObject("The raw SafetyCulture object returned by the API.");

const inspectionSearchItemSchema = s.looseObject("One inspection returned by SafetyCulture search.", {
  audit_id: s.string("The SafetyCulture inspection ID."),
  modified_at: s.string("The inspection modification timestamp, when requested."),
  template_id: s.string("The template ID used by the inspection, when requested."),
});

const actionSchema = s.looseObject("A SafetyCulture action object.", {
  task: s.looseObject("The task data associated with the action."),
  custom_field_and_values: s.array("Custom fields and their values belonging to the action.", rawObjectSchema),
  type: s.looseObject("Custom type metadata associated with the action."),
});

const collaboratorSchema = s.looseRequiredObject(
  "A collaborator involved in a SafetyCulture action.",
  {
    type: s.stringEnum("The collaborator type.", ["USER", "GROUP", "EXTERNAL_USER", "CONTRIBUTOR"]),
    role: s.stringEnum("The collaborator role.", ["ASSIGNEE", "CREATOR"]),
    id: s.string("The user, group, external user, or contributor identifier."),
  },
  { optional: ["role", "id"] },
);

const referenceSchema = s.looseRequiredObject("A reference attached to a SafetyCulture action.", {
  type: s.stringEnum("The reference type.", [
    "SENSOR",
    "SENSOR_ALERT",
    "INSPECTION",
    "INCIDENT",
    "SCHEDULE",
    "ACTION",
    "LINKED_INSPECTION",
    "ASSET_MAINTENANCE_PLAN",
  ]),
  id: s.string("The referenced resource ID."),
});

const actionTypeSchema = s.looseRequiredObject("The SafetyCulture action type to create.", {
  type: s.stringEnum("The task type.", ["TASK_TYPE_ACTION", "TASK_TYPE_CUSTOM"]),
  id: s.string("The action type ID."),
  name: s.string("The action type name."),
});

const fieldValueSchema = s.looseRequiredObject("A SafetyCulture custom field value to create with an action.", {
  field_id: s.string("The custom field ID."),
});

export const safetycultureActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_inspections",
    description:
      "Search SafetyCulture inspections by modification time, template, archive state, completion state, and owner.",
    inputSchema: s.object(
      "Filters for searching SafetyCulture inspections.",
      {
        fields: s.array(
          "Fields to return for each inspection. audit_id is always included by SafetyCulture.",
          s.stringEnum("A SafetyCulture inspection search field.", ["audit_id", "modified_at", "template_id"]),
        ),
        order: s.stringEnum("The order to return inspection results in.", ["asc", "desc"]),
        modifiedAfter: s.dateTime("Filter inspections modified after this timestamp."),
        modifiedBefore: s.dateTime("Filter inspections modified before this timestamp."),
        templateIds: s.array(
          "Template IDs to search inspections for.",
          s.string("A SafetyCulture template ID.", { minLength: 1 }),
        ),
        archived: s.stringEnum("Filter inspections by archived status.", ["false", "true", "both"]),
        completed: s.stringEnum("Filter inspections by completion status.", ["both", "false", "true"]),
        owner: s.stringEnum("Filter inspections by owner.", ["all", "me", "other"]),
        limit: s.positiveInteger("The maximum number of inspections to return."),
      },
      {
        optional: [
          "fields",
          "order",
          "modifiedAfter",
          "modifiedBefore",
          "templateIds",
          "archived",
          "completed",
          "owner",
          "limit",
        ],
      },
    ),
    outputSchema: s.object("SafetyCulture inspection search result.", {
      count: s.nonNegativeInteger("The number of inspection results returned."),
      total: s.nonNegativeInteger("The total number of inspection results available."),
      inspections: s.array("Inspections returned by SafetyCulture.", inspectionSearchItemSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_inspection",
    description: "Get a SafetyCulture inspection by ID.",
    inputSchema: s.object("Input for reading one SafetyCulture inspection.", {
      inspectionId: s.string("The SafetyCulture inspection ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("SafetyCulture inspection result.", {
      inspection: rawObjectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_actions",
    description: "List SafetyCulture actions using pagination, sorting, and optional filters.",
    inputSchema: s.object(
      "Input for listing SafetyCulture actions.",
      {
        pageSize: s.integer("Number of actions to return in a single request. Maximum 100.", {
          minimum: 1,
          maximum: 100,
        }),
        pageToken: s.string("The page token returned by a previous list_actions response.", { minLength: 1 }),
        inspectionId: s.string("The inspection ID to list related actions for.", { minLength: 1 }),
        offset: s.nonNegativeInteger("Offset from where actions should be listed."),
        sortField: s.stringEnum("The field to use for sorting.", ["PRIORITY", "DATE_DUE", "CREATED_AT", "MODIFIED_AT"]),
        sortDirection: s.stringEnum("The sorting direction.", ["ASC", "DESC"]),
        withoutCount: s.boolean("Whether SafetyCulture should omit the deprecated total count."),
        taskFilters: s.array("Task filters to apply to the SafetyCulture action list request.", rawObjectSchema),
      },
      {
        optional: [
          "pageSize",
          "pageToken",
          "inspectionId",
          "offset",
          "sortField",
          "sortDirection",
          "withoutCount",
          "taskFilters",
        ],
      },
    ),
    outputSchema: s.object("SafetyCulture action list result.", {
      actions: s.array("Actions returned by SafetyCulture.", actionSchema),
      nextPageToken: s.string("Token for the next page of SafetyCulture actions."),
      total: s.nonNegativeInteger("The total number of actions returned by SafetyCulture."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_action",
    description: "Get a SafetyCulture action by ID.",
    inputSchema: s.object("Input for reading one SafetyCulture action.", {
      actionId: s.string("The SafetyCulture action ID.", { minLength: 1 }),
    }),
    outputSchema: s.object(
      "SafetyCulture action result.",
      {
        action: actionSchema,
        readOnly: s.boolean("Whether the action is read-only for the token owner."),
        raw: rawObjectSchema,
      },
      { optional: ["readOnly"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_action",
    description: "Create a SafetyCulture action and return the created action ID.",
    inputSchema: s.object(
      "Input for creating a SafetyCulture action.",
      {
        title: s.string("Required title of the action. SafetyCulture limits this to 255 characters.", {
          minLength: 1,
          maxLength: 255,
        }),
        taskId: s.string("The unique identifier of the action. If omitted, SafetyCulture generates one."),
        description: s.string("Description of the action. SafetyCulture limits this to 30000 characters.", {
          maxLength: 30000,
        }),
        collaborators: s.array("Collaborators involved in the action.", collaboratorSchema),
        priorityId: s.string("ID of the action priority."),
        statusId: s.string("ID of the action status."),
        createdAt: s.dateTime("Date and time this action was created."),
        dueAt: s.dateTime("Date and time this action is due."),
        inspectionId: s.string("ID of the inspection the action belongs to."),
        inspectionItemId: s.string("ID of the item in the inspection associated with the action."),
        templateId: s.string("Template ID associated with the action."),
        siteId: s.string("Site ID associated with the action."),
        references: s.array("References attached to the action.", referenceSchema),
        assetId: s.string("Asset ID associated with the action."),
        labelIds: s.array("IDs of labels associated with the action.", s.string("A label ID.")),
        type: actionTypeSchema,
        fieldValues: s.array("Custom field values to create with the action.", fieldValueSchema),
        templateIds: s.array("Template IDs to link to the action.", s.string("A template ID.")),
      },
      {
        optional: [
          "taskId",
          "description",
          "collaborators",
          "priorityId",
          "statusId",
          "createdAt",
          "dueAt",
          "inspectionId",
          "inspectionItemId",
          "templateId",
          "siteId",
          "references",
          "assetId",
          "labelIds",
          "type",
          "fieldValues",
          "templateIds",
        ],
      },
    ),
    outputSchema: s.object("SafetyCulture create action result.", {
      actionId: s.string("The created SafetyCulture action ID."),
      raw: rawObjectSchema,
    }),
  }),
];
