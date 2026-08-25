import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wrike";

const wrikeIdSchema = s.nonEmptyString("The Wrike API resource ID.");
const wrikeIdListSchema = s.stringArray("Wrike API resource IDs.", {
  minItems: 1,
  maxItems: 1000,
  itemDescription: "One Wrike API resource ID.",
});
const rawObjectSchema = s.looseObject("The raw Wrike API object.");

const responseBaseProperties = {
  kind: s.nonEmptyString("The Wrike response kind."),
  nextPageToken: s.nonEmptyString("The pagination token returned by Wrike for the next page."),
  raw: rawObjectSchema,
};

const optionalResponseFields = ["nextPageToken"] as const;

const contactTypeSchema = s.stringEnum("The Wrike contact type.", ["Group", "Asset", "Person", "Robot"]);

const folderFieldSchema = s.stringEnum("Optional Wrike folder response field.", [
  "cascadingFields",
  "accessRoles",
  "customItemTypeId",
  "customColumnIds",
  "contractType",
  "attachmentCount",
  "briefDescription",
  "finance",
]);

const taskFieldSchema = s.stringEnum("Optional Wrike task response field.", [
  "cascadingFields",
  "customItemTypeId",
  "billingType",
  "attachmentCount",
  "workScheduleId",
  "responsiblePlaceholderIds",
  "effortAllocation",
  "recurrent",
  "finance",
]);

const taskStatusSchema = s.stringEnum("The Wrike task status.", ["Active", "Deferred", "Completed", "Cancelled"]);
const taskImportanceSchema = s.stringEnum("The Wrike task importance.", ["High", "Low", "Normal"]);
const taskTypeSchema = s.stringEnum("The Wrike task type.", ["Milestone", "Backlog", "Planned"]);
const taskSortFieldSchema = s.stringEnum("The Wrike task sort field.", [
  "Status",
  "Importance",
  "UpdatedDate",
  "CreatedDate",
  "Title",
  "StartFinishInterval",
  "DueDate",
  "LastAccessDate",
  "CompletedDate",
]);
const taskSortOrderSchema = s.stringEnum("The Wrike task sort order.", ["Asc", "Desc"]);

const compactContactSchema = s.object("A normalized Wrike contact.", {
  id: s.nullableString("The Wrike contact ID."),
  firstName: s.nullableString("The contact first name."),
  lastName: s.nullableString("The contact last name."),
  type: s.nullableString("The Wrike contact type."),
  email: s.nullableString("The first email from the contact profiles."),
  accountId: s.nullableString("The first account ID from the contact profiles."),
  timezone: s.nullableString("The contact timezone."),
  locale: s.nullableString("The contact locale."),
  deleted: s.nullableBoolean("Whether Wrike marks the contact as deleted."),
  me: s.nullableBoolean("Whether this contact is the requesting user."),
  raw: rawObjectSchema,
});

const folderSchema = s.object("A normalized Wrike folder or project.", {
  id: s.nullableString("The Wrike folder ID."),
  title: s.nullableString("The folder or project title."),
  color: s.nullableString("The folder color returned by Wrike."),
  childIds: s.stringArray("Child folder IDs returned by Wrike.", { itemDescription: "One child folder ID." }),
  scope: s.nullableString("The Wrike folder scope."),
  project: s.nullable(rawObjectSchema),
  permalink: s.nullableString("The Wrike folder permalink."),
  raw: rawObjectSchema,
});

const taskSchema = s.object("A normalized Wrike task.", {
  id: s.nullableString("The Wrike task ID."),
  title: s.nullableString("The task title."),
  status: s.nullableString("The Wrike task status."),
  importance: s.nullableString("The Wrike task importance."),
  permalink: s.nullableString("The Wrike task permalink."),
  responsibleIds: s.stringArray("Wrike contact IDs assigned to the task.", {
    itemDescription: "One Wrike contact ID.",
  }),
  parentIds: s.stringArray("Wrike parent folder IDs for the task.", { itemDescription: "One Wrike folder ID." }),
  superTaskIds: s.stringArray("Wrike parent task IDs for the task.", { itemDescription: "One Wrike task ID." }),
  subTaskIds: s.stringArray("Wrike subtask IDs for the task.", { itemDescription: "One Wrike task ID." }),
  createdDate: s.nullableString("The task creation timestamp returned by Wrike."),
  updatedDate: s.nullableString("The task update timestamp returned by Wrike."),
  completedDate: s.nullableString("The task completion timestamp returned by Wrike."),
  raw: rawObjectSchema,
});

const contactQuerySchema = s.object(
  "Filters for listing Wrike contacts.",
  {
    me: s.boolean("Whether to return only the requesting user's contact."),
    deleted: s.boolean("Whether to include deleted contacts."),
    active: s.boolean("Whether to filter contacts by active status."),
    name: s.nonEmptyString("The contact name filter."),
    emails: s.array("Email addresses to filter contacts by.", s.email("One email address."), {
      minItems: 1,
      maxItems: 100,
    }),
    types: s.array("Wrike contact types to include.", contactTypeSchema, { minItems: 1 }),
    fields: s.array(
      "Optional Wrike contact response fields.",
      s.stringEnum("Optional Wrike contact response field.", [
        "metadata",
        "currentCostRate",
        "customFields",
        "currentBillRate",
        "jobRoleId",
        "workScheduleId",
      ]),
      { minItems: 1 },
    ),
  },
  { optional: ["me", "deleted", "active", "name", "emails", "types", "fields"] },
);

const listFoldersInputSchema = s.object(
  "Filters for listing Wrike folders and projects.",
  {
    permalink: s.nonEmptyString("Folder permalink to match exactly."),
    descendants: s.boolean("Whether to add all descendant folders to the search scope."),
    project: s.boolean("Filter only projects when true or only folders when false."),
    deleted: s.boolean("Whether to get folders from the recycle bin."),
    pageSize: s.integer("The number of folders to return. Wrike supports up to 1000.", {
      minimum: 1,
      maximum: 1000,
    }),
    nextPageToken: s.nonEmptyString("The Wrike pagination token from the previous response."),
    fields: s.array("Optional Wrike folder response fields.", folderFieldSchema, { minItems: 1 }),
  },
  { optional: ["permalink", "descendants", "project", "deleted", "pageSize", "nextPageToken", "fields"] },
);

const getFoldersInputSchema = s.object(
  "Path and query parameters for retrieving Wrike folders by ID.",
  {
    folderIds: wrikeIdListSchema,
    withInvitations: s.boolean("Whether to include invitations in sharedIds."),
    plainTextCustomFields: s.boolean("Whether to strip HTML tags from custom fields."),
    fields: s.array("Optional Wrike folder response fields.", folderFieldSchema, { minItems: 1 }),
  },
  { optional: ["withInvitations", "plainTextCustomFields", "fields"] },
);

const createFolderInputSchema = s.object(
  "Parameters for creating a Wrike folder.",
  {
    folderId: wrikeIdSchema,
    title: s.nonEmptyString("The Wrike folder title."),
    description: s.string("The Wrike folder description."),
    shareds: s.array("Wrike user or invited user IDs to share the folder with.", wrikeIdSchema, { minItems: 1 }),
    withInvitations: s.boolean("Whether to include invitations in ownerIds and sharedIds."),
    fields: s.array("Optional Wrike folder response fields.", folderFieldSchema, { minItems: 1 }),
  },
  { optional: ["description", "shareds", "withInvitations", "fields"] },
);

const listTasksInputSchema = s.object(
  "Filters for listing Wrike tasks.",
  {
    title: s.nonEmptyString("A title substring filter."),
    status: s.array("Wrike task statuses to include.", taskStatusSchema, { minItems: 1 }),
    importance: taskImportanceSchema,
    type: taskTypeSchema,
    limit: s.integer("The maximum number of tasks returned by Wrike.", { minimum: 1 }),
    sortField: taskSortFieldSchema,
    sortOrder: taskSortOrderSchema,
    nextPageToken: s.nonEmptyString("The Wrike pagination token from the previous response."),
    authors: s.array("Wrike contact IDs used as author filters.", wrikeIdSchema, { minItems: 1 }),
    responsibles: s.array("Wrike contact IDs used as assignee filters.", wrikeIdSchema, { minItems: 1 }),
    fields: s.array("Optional Wrike task response fields.", taskFieldSchema, { minItems: 1 }),
  },
  {
    optional: [
      "title",
      "status",
      "importance",
      "type",
      "limit",
      "sortField",
      "sortOrder",
      "nextPageToken",
      "authors",
      "responsibles",
      "fields",
    ],
  },
);

const getTasksInputSchema = s.object(
  "Path and query parameters for retrieving Wrike tasks by ID.",
  {
    taskIds: wrikeIdListSchema,
    withInvitations: s.boolean("Whether to include invitations in sharedIds and responsibleIds."),
    plainTextCustomFields: s.boolean("Whether to strip HTML tags from custom fields."),
    fields: s.array("Optional Wrike task response fields.", taskFieldSchema, { minItems: 1 }),
  },
  { optional: ["withInvitations", "plainTextCustomFields", "fields"] },
);

const createTaskInputSchema = s.object(
  "Parameters for creating a Wrike task in a folder.",
  {
    folderId: wrikeIdSchema,
    title: s.nonEmptyString("The Wrike task title."),
    description: s.string("The Wrike task description."),
    status: taskStatusSchema,
    importance: taskImportanceSchema,
    responsibles: s.array("Wrike contact IDs to assign to the task.", wrikeIdSchema, { minItems: 1 }),
    parents: s.array("Additional Wrike parent folder IDs.", wrikeIdSchema, { minItems: 1 }),
    superTasks: s.array("Wrike parent task IDs for creating a subtask.", wrikeIdSchema, { minItems: 1 }),
    followers: s.array("Wrike contact IDs to add as followers.", wrikeIdSchema, { minItems: 1 }),
    follow: s.boolean("Whether the caller should follow the created task."),
    fields: s.array("Optional Wrike task response fields.", taskFieldSchema, { minItems: 1 }),
  },
  {
    optional: [
      "description",
      "status",
      "importance",
      "responsibles",
      "parents",
      "superTasks",
      "followers",
      "follow",
      "fields",
    ],
  },
);

function wrikeListOutput(description: string, outputKey: "contacts", itemSchema: JsonSchema): JsonSchema;
function wrikeListOutput(description: string, outputKey: "folders", itemSchema: JsonSchema): JsonSchema;
function wrikeListOutput(description: string, outputKey: "tasks", itemSchema: JsonSchema): JsonSchema;
function wrikeListOutput(description: string, outputKey: string, itemSchema: JsonSchema): JsonSchema {
  return s.object(
    description,
    {
      ...responseBaseProperties,
      [outputKey]: s.array(`${outputKey} returned by Wrike.`, itemSchema),
    },
    { optional: [...optionalResponseFields] },
  );
}

function wrikeSingleOutput(description: string, outputKey: "folder", itemSchema: JsonSchema): JsonSchema;
function wrikeSingleOutput(description: string, outputKey: "task", itemSchema: JsonSchema): JsonSchema;
function wrikeSingleOutput(description: string, outputKey: string, itemSchema: JsonSchema): JsonSchema {
  return s.object(
    description,
    {
      ...responseBaseProperties,
      [outputKey]: itemSchema,
    },
    { optional: [...optionalResponseFields] },
  );
}

export const wrikeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Wrike contacts in the current account with optional filters.",
    requiredScopes: [],
    inputSchema: contactQuerySchema,
    outputSchema: wrikeListOutput("A list of Wrike contacts.", "contacts", compactContactSchema),
  }),
  defineProviderAction(service, {
    name: "list_folders",
    description: "List Wrike folders and projects in the current account.",
    requiredScopes: [],
    inputSchema: listFoldersInputSchema,
    outputSchema: wrikeListOutput("A list of Wrike folders or projects.", "folders", folderSchema),
  }),
  defineProviderAction(service, {
    name: "get_folders",
    description: "Retrieve complete Wrike folder or project information by ID.",
    requiredScopes: [],
    inputSchema: getFoldersInputSchema,
    outputSchema: wrikeListOutput("Wrike folders or projects retrieved by ID.", "folders", folderSchema),
  }),
  defineProviderAction(service, {
    name: "create_folder",
    description: "Create a Wrike folder under a parent folder or root folder ID.",
    requiredScopes: [],
    inputSchema: createFolderInputSchema,
    outputSchema: wrikeSingleOutput("The Wrike folder creation response.", "folder", folderSchema),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "Search Wrike tasks in the current account with optional filters.",
    requiredScopes: [],
    inputSchema: listTasksInputSchema,
    outputSchema: wrikeListOutput("A list of Wrike tasks.", "tasks", taskSchema),
  }),
  defineProviderAction(service, {
    name: "get_tasks",
    description: "Retrieve complete Wrike task information by ID.",
    requiredScopes: [],
    inputSchema: getTasksInputSchema,
    outputSchema: wrikeListOutput("Wrike tasks retrieved by ID.", "tasks", taskSchema),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a Wrike task in a folder using JSON-friendly task fields.",
    requiredScopes: [],
    inputSchema: createTaskInputSchema,
    outputSchema: wrikeSingleOutput("The Wrike task creation response.", "task", taskSchema),
  }),
];
