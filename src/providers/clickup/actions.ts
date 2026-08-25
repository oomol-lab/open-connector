import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clickup";
const readScope = ["clickup.read"];
const writeScope = ["clickup.write"];

const inputPayload = (properties: Record<string, JsonSchema>, optional: readonly string[] = []) =>
  s.object("The input payload for this action.", properties, { optional });

const outputPayload = (properties: Record<string, JsonSchema>, optional: readonly string[] = []) =>
  s.object("The output payload for this action.", properties, { optional });

const stringOrInteger = (description: string, minStringLength?: number) =>
  s.anyOf(description, [
    s.string(description, minStringLength === undefined ? {} : { minLength: minStringLength }),
    s.integer(description),
  ]);

const stringOrNumber = (description: string) => s.anyOf(description, [s.string(description), s.number(description)]);

const nullableStringOrNumber = (description: string) => s.nullable(stringOrNumber(description));

const priorityValue = (description: string) =>
  s.anyOf(description, [
    { type: "integer", const: 1, description: "Urgent ClickUp priority." },
    { type: "integer", const: 2, description: "High ClickUp priority." },
    { type: "integer", const: 3, description: "Normal ClickUp priority." },
    { type: "integer", const: 4, description: "Low ClickUp priority." },
  ]);

const nullablePriorityValue = (description: string) =>
  s.anyOf(description, [priorityValue(description), { type: "null", description: "Clear the ClickUp priority." }]);

const nullableStringField = (description: string) =>
  s.anyOf(description, [
    s.string(description, { minLength: 1 }),
    { type: "null", description: "Clear this ClickUp field." },
  ]);

const workspaceIdField = s.string("The ClickUp workspace ID.", {
  minLength: 1,
});
const spaceIdField = s.string("The ClickUp space ID.", { minLength: 1 });
const folderIdField = s.string("The ClickUp folder ID.", { minLength: 1 });
const listIdField = s.string("The ClickUp list ID.", { minLength: 1 });
const taskIdField = s.string("The ClickUp task ID.", { minLength: 1 });
const templateIdField = s.string("The ClickUp template ID.", { minLength: 1 });
const fieldIdField = s.string("The ClickUp custom field ID.", { minLength: 1 });
const checklistIdField = s.string("The ClickUp checklist ID.", {
  minLength: 1,
});
const checklistItemIdField = s.string("The ClickUp checklist item ID.", {
  minLength: 1,
});
const viewIdField = s.string("The ClickUp view ID.", { minLength: 1 });
const userIdField = stringOrInteger("The ClickUp user ID.", 1);
const commentIdField = stringOrInteger("The ClickUp comment ID.", 1);
const tagNameField = s.string("The ClickUp tag name.", { minLength: 1 });

const userSchema = (description = "A ClickUp user.") =>
  s.looseRequiredObject(
    description,
    {
      id: stringOrInteger("The ClickUp user ID."),
      username: s.nullable(s.string("The ClickUp username.")),
      email: s.string("The ClickUp user email address."),
      color: s.nullable(s.string("The ClickUp user color.")),
      profilePicture: s.nullable(s.string("The ClickUp profile picture URL.")),
      initials: s.string("The ClickUp user initials."),
      timezone: s.string("The ClickUp user timezone."),
    },
    {
      optional: ["username", "email", "color", "profilePicture", "initials", "timezone"],
    },
  );

const workspaceMemberSchema = (description = "A ClickUp workspace member.") =>
  s.looseRequiredObject(description, {
    user: userSchema("The ClickUp user in the workspace member entry."),
  });

const workspaceSchema = (description = "A ClickUp workspace.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp workspace ID."),
      name: s.string("The ClickUp workspace name."),
      color: s.string("The ClickUp workspace color."),
      avatar: s.nullable(s.string("The ClickUp workspace avatar URL.")),
      members: s.array("The members visible on the ClickUp workspace.", workspaceMemberSchema()),
    },
    { optional: ["color", "avatar", "members"] },
  );

const memberProfileSchema = (description = "A ClickUp member profile.") =>
  s.looseRequiredObject(
    description,
    {
      id: stringOrInteger("The ClickUp user ID."),
      username: s.string("The ClickUp username."),
      email: s.string("The ClickUp user email address."),
      color: s.nullable(s.string("The ClickUp user color.")),
      initials: s.string("The ClickUp user initials."),
      profilePicture: s.nullable(s.string("The ClickUp profile picture URL.")),
      profileInfo: s.looseRequiredObject("The ClickUp user profile information block.", {}),
    },
    { optional: ["color", "profilePicture", "profileInfo"] },
  );

const workspaceUserMemberSchema = (description = "A ClickUp workspace user member.") =>
  s.looseRequiredObject(
    description,
    {
      user: userSchema("The ClickUp user details."),
      invited_by: userSchema("The ClickUp user who invited this member."),
      shared: s.looseRequiredObject(
        "The ClickUp items shared with this member.",
        {
          tasks: s.array("The shared ClickUp tasks.", s.string("A ClickUp task ID.")),
          lists: s.array("The shared ClickUp lists.", s.string("A ClickUp list ID.")),
          folders: s.array("The shared ClickUp folders.", s.string("A ClickUp folder ID.")),
        },
        { optional: ["tasks", "lists", "folders"] },
      ),
    },
    { optional: ["invited_by", "shared"] },
  );

const statusSchema = (description = "A ClickUp status.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp status ID."),
      status: s.string("The ClickUp status name."),
      type: s.string("The ClickUp status type."),
      orderindex: stringOrNumber("The ClickUp status order index."),
      color: s.string("The ClickUp status color."),
    },
    { optional: ["id", "type"] },
  );

const accessRefSchema = (description = "A compact ClickUp resource reference.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp resource ID."),
      name: s.string("The ClickUp resource name."),
      hidden: s.boolean("Whether the ClickUp resource is hidden."),
      access: s.boolean("Whether the authenticated user can access the resource."),
    },
    { optional: ["name", "hidden", "access"] },
  );

const listRefSchema = (description = "A compact ClickUp list reference.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp list ID."),
      name: s.string("The ClickUp list name."),
      access: s.boolean("Whether the authenticated user can access the list."),
    },
    { optional: ["name", "access"] },
  );

const spaceRefSchema = (description = "A compact ClickUp space reference.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp space ID."),
      name: s.string("The ClickUp space name."),
      access: s.boolean("Whether the authenticated user can access the space."),
    },
    { optional: ["name", "access"] },
  );

const taskTagSchema = (description = "A ClickUp task tag.") =>
  s.looseRequiredObject(
    description,
    {
      name: s.string("The ClickUp tag name."),
      tag_fg: s.string("The ClickUp tag foreground color."),
      tag_bg: s.string("The ClickUp tag background color."),
    },
    { optional: ["tag_fg", "tag_bg"] },
  );

const customFieldSchema = (description = "A ClickUp custom field.") =>
  s.looseRequiredObject(description, {
    id: s.string("The ClickUp custom field ID."),
    name: s.string("The ClickUp custom field name."),
    type: s.string("The ClickUp custom field type."),
    type_config: s.looseRequiredObject("The ClickUp custom field type configuration.", {}),
    date_created: s.string("The ClickUp custom field creation timestamp."),
    hide_from_guests: s.boolean("Whether the ClickUp custom field is hidden from guests."),
  });

const customTaskTypeSchema = (description = "A ClickUp custom task type.") =>
  s.looseRequiredObject(
    description,
    {
      id: stringOrInteger("The ClickUp custom task type ID."),
      name: s.string("The ClickUp custom task type name."),
      name_plural: s.nullable(s.string("The ClickUp custom task type plural name.")),
      description: s.nullable(s.string("The ClickUp custom task type description.")),
    },
    { optional: ["name_plural", "description"] },
  );

const attachmentSchema = (description = "A ClickUp attachment.") =>
  s.looseRequiredObject(description, {
    id: s.string("The ClickUp attachment ID."),
    version: s.string("The ClickUp attachment version."),
    date: stringOrInteger("The ClickUp attachment timestamp."),
    title: s.string("The ClickUp attachment file name."),
    extension: s.string("The ClickUp attachment file extension."),
    thumbnail_small: s.string("The ClickUp attachment small thumbnail URL."),
    thumbnail_large: s.string("The ClickUp attachment large thumbnail URL."),
    url: s.string("The ClickUp attachment URL."),
  });

const viewSchema = (description = "A ClickUp view.") =>
  s.looseRequiredObject(description, {
    id: s.string("The ClickUp view ID."),
    name: s.string("The ClickUp view name."),
    type: s.string("The ClickUp view type."),
  });

const checklistItemSchema = (description = "A ClickUp checklist item.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp checklist item ID."),
      name: s.string("The ClickUp checklist item name."),
      orderindex: stringOrNumber("The ClickUp checklist item order index."),
      assignee: s.anyOf("The ClickUp checklist item assignee.", [
        userSchema("The ClickUp checklist item assignee."),
        s.string("The ClickUp checklist item assignee ID."),
        s.integer("The ClickUp checklist item assignee ID."),
        {
          type: "null",
          description: "The ClickUp checklist item has no assignee.",
        },
      ]),
      resolved: s.boolean("Whether the ClickUp checklist item is resolved."),
      parent: s.nullable(s.string("The parent ClickUp checklist item ID.")),
      date_created: s.string("The ClickUp checklist item creation timestamp."),
      children: s.array("The child ClickUp checklist item IDs.", s.string("A child ClickUp checklist item ID.")),
    },
    { optional: ["assignee", "parent"] },
  );

const checklistSchema = (description = "A ClickUp checklist.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp checklist ID."),
      task_id: s.string("The ClickUp parent task ID."),
      name: s.string("The ClickUp checklist name."),
      date_created: s.string("The ClickUp checklist creation timestamp."),
      orderindex: stringOrNumber("The ClickUp checklist order index."),
      resolved: stringOrNumber("The number of resolved ClickUp checklist items."),
      unresolved: stringOrNumber("The number of unresolved ClickUp checklist items."),
      items: s.array("The ClickUp checklist items.", checklistItemSchema()),
    },
    { optional: ["date_created"] },
  );

const taskSchema = (description = "A ClickUp task.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp task ID."),
      custom_id: s.nullable(s.string("The ClickUp custom task ID.")),
      custom_item_id: s.anyOf("The ClickUp custom item type ID.", [
        s.integer("The ClickUp custom item type ID."),
        s.string("The ClickUp custom item type ID."),
        {
          type: "null",
          description: "The ClickUp custom item type ID is not set.",
        },
      ]),
      name: s.string("The ClickUp task name."),
      text_content: s.string("The ClickUp plain text task content."),
      description: s.string("The ClickUp task description."),
      markdown_description: s.string("The ClickUp Markdown task description."),
      status: statusSchema("The ClickUp task status."),
      orderindex: stringOrNumber("The ClickUp task order index."),
      date_created: s.string("The ClickUp task creation timestamp."),
      date_updated: s.string("The ClickUp task update timestamp."),
      date_closed: s.nullable(s.string("The ClickUp task close timestamp.")),
      date_done: s.nullable(s.string("The ClickUp task done timestamp.")),
      archived: s.boolean("Whether the ClickUp task is archived."),
      creator: userSchema("The ClickUp task creator."),
      assignees: s.array("The ClickUp task assignees.", userSchema()),
      watchers: s.array("The ClickUp task watchers.", userSchema()),
      checklists: s.array("The ClickUp task checklists.", checklistSchema()),
      tags: s.array("The ClickUp task tags.", taskTagSchema()),
      parent: s.nullable(s.string("The ClickUp parent task ID.")),
      top_level_parent: s.nullable(s.string("The ClickUp top-level parent task ID.")),
      priority: s.nullable(
        s.looseRequiredObject(
          "The ClickUp task priority.",
          {
            id: s.string("The ClickUp priority ID."),
            priority: s.string("The ClickUp priority name."),
            color: s.string("The ClickUp priority color."),
            orderindex: stringOrNumber("The ClickUp priority order index."),
          },
          { optional: ["id", "priority", "color", "orderindex"] },
        ),
      ),
      due_date: s.nullable(s.string("The ClickUp task due date timestamp.")),
      start_date: s.nullable(s.string("The ClickUp task start date timestamp.")),
      points: nullableStringOrNumber("The ClickUp task points value."),
      time_estimate: nullableStringOrNumber("The ClickUp task time estimate."),
      time_spent: nullableStringOrNumber("The ClickUp task time spent."),
      custom_fields: s.array("The ClickUp custom fields.", s.looseRequiredObject("A ClickUp custom field object.", {})),
      dependencies: s.array(
        "The ClickUp task dependencies.",
        s.looseRequiredObject("A ClickUp task dependency object.", {}),
      ),
      linked_tasks: s.array("The ClickUp linked tasks.", s.looseRequiredObject("A linked ClickUp task object.", {})),
      locations: s.array("The ClickUp secondary list locations for the task.", accessRefSchema()),
      team_id: s.string("The ClickUp workspace ID."),
      url: s.string("The ClickUp task URL."),
      permission_level: s.string("The ClickUp task permission level."),
      list: listRefSchema("The ClickUp task list."),
      project: accessRefSchema("The ClickUp folder or project reference."),
      folder: accessRefSchema("The ClickUp folder reference."),
      space: spaceRefSchema("The ClickUp space reference."),
    },
    {
      optional: [
        "custom_id",
        "custom_item_id",
        "text_content",
        "description",
        "markdown_description",
        "status",
        "orderindex",
        "date_created",
        "date_updated",
        "date_closed",
        "date_done",
        "archived",
        "creator",
        "assignees",
        "watchers",
        "checklists",
        "tags",
        "parent",
        "top_level_parent",
        "priority",
        "due_date",
        "start_date",
        "points",
        "time_estimate",
        "time_spent",
        "custom_fields",
        "dependencies",
        "linked_tasks",
        "locations",
        "team_id",
        "url",
        "permission_level",
        "list",
        "project",
        "folder",
        "space",
      ],
    },
  );

const spaceSchema = (description = "A ClickUp space.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp space ID."),
      name: s.string("The ClickUp space name."),
      private: s.boolean("Whether the ClickUp space is private."),
      color: s.nullable(s.string("The ClickUp space color.")),
      avatar: s.nullable(s.string("The ClickUp space avatar URL.")),
      archived: s.boolean("Whether the ClickUp space is archived."),
      statuses: s.array("The ClickUp space statuses.", statusSchema()),
      members: s.array("The members visible on the ClickUp space.", workspaceMemberSchema()),
      multiple_assignees: s.boolean("Whether the ClickUp space allows multiple assignees."),
      features: s.looseRequiredObject("The ClickUp space features.", {}),
    },
    {
      optional: ["color", "avatar", "archived", "statuses", "members", "multiple_assignees", "features"],
    },
  );

const folderSchema = (description = "A ClickUp folder.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp folder ID."),
      name: s.string("The ClickUp folder name."),
      orderindex: stringOrNumber("The ClickUp folder order index."),
      override_statuses: s.boolean("Whether the ClickUp folder overrides statuses."),
      hidden: s.boolean("Whether the ClickUp folder is hidden."),
      task_count: s.string("The ClickUp folder task count."),
      lists: s.array(
        "The ClickUp lists under the folder.",
        s.anyOf("A ClickUp folder list entry.", [
          s.string("A ClickUp list ID."),
          s.looseRequiredObject("A ClickUp list object.", {}),
        ]),
      ),
      space: spaceRefSchema("The ClickUp parent space."),
    },
    {
      optional: ["orderindex", "override_statuses", "hidden", "task_count", "lists", "space"],
    },
  );

const listSchema = (description = "A ClickUp list.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp list ID."),
      name: s.string("The ClickUp list name."),
      orderindex: stringOrNumber("The ClickUp list order index."),
      content: s.string("The ClickUp list content."),
      status: s.looseRequiredObject("The ClickUp list status descriptor.", {}),
      priority: s.nullable(s.looseRequiredObject("The ClickUp list priority descriptor.", {})),
      assignee: s.nullable(userSchema("The ClickUp list assignee.")),
      task_count: s.nullable(s.string("The ClickUp list task count.")),
      due_date: s.nullable(s.string("The ClickUp list due date timestamp.")),
      start_date: s.nullable(s.string("The ClickUp list start date timestamp.")),
      folder: accessRefSchema("The ClickUp parent folder."),
      space: spaceRefSchema("The ClickUp parent space."),
      archived: s.boolean("Whether the ClickUp list is archived."),
      override_statuses: s.boolean("Whether the ClickUp list overrides statuses."),
      permission_level: s.string("The ClickUp list permission level."),
      statuses: s.array("The ClickUp list statuses.", statusSchema()),
      inbound_address: s.string("The ClickUp inbound email address."),
    },
    {
      optional: [
        "orderindex",
        "content",
        "status",
        "priority",
        "assignee",
        "task_count",
        "due_date",
        "start_date",
        "folder",
        "space",
        "archived",
        "override_statuses",
        "permission_level",
        "statuses",
        "inbound_address",
      ],
    },
  );

const taskTemplateSchema = (description = "A ClickUp task template.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp task template ID."),
      name: s.string("The ClickUp task template name."),
    },
    { optional: ["name"] },
  );

const commentPartSchema = (description = "A ClickUp comment text segment.") =>
  s.looseRequiredObject(description, {
    text: s.string("The ClickUp comment text segment."),
  });

const commentSchema = (description = "A ClickUp comment.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp comment ID."),
      comment: s.array("The ClickUp comment segments.", commentPartSchema()),
      comment_text: s.string("The ClickUp comment text."),
      user: userSchema("The ClickUp comment author."),
      resolved: s.boolean("Whether the ClickUp comment is resolved."),
      assignee: userSchema("The ClickUp comment assignee."),
      assigned_by: userSchema("The ClickUp user who assigned the comment."),
      reactions: s.array(
        "The ClickUp comment reactions.",
        s.looseRequiredObject("A ClickUp comment reaction entry.", {}),
      ),
      date: s.string("The ClickUp comment timestamp."),
      reply_count: s.string("The number of replies on the ClickUp comment."),
    },
    { optional: ["reply_count"] },
  );

const commentMutationReceiptSchema = (description = "A ClickUp comment mutation receipt.") =>
  s.looseRequiredObject(
    description,
    {
      id: s.string("The ClickUp comment ID."),
      hist_id: s.string("The ClickUp comment history ID."),
      date: stringOrInteger("The ClickUp comment mutation timestamp."),
    },
    { optional: ["id", "hist_id", "date"] },
  );

const emptyInputSchema = inputPayload({});

const optionalStringArrayField = (description: string) =>
  s.array(description, s.string("A ClickUp string value.", { minLength: 1 }), {
    minItems: 1,
  });

const optionalIntegerArrayField = (description: string) =>
  s.array(description, s.integer("A ClickUp integer value."), { minItems: 1 });

const customFieldValueOptionsSchema = s.looseRequiredObject("The ClickUp custom field value options.", {});
const spaceFeaturesSchema = s.looseRequiredObject("The ClickUp space feature configuration.", {});

const listSpacesInputSchema = inputPayload(
  {
    workspaceId: workspaceIdField,
    archived: s.boolean("Whether to include archived ClickUp spaces."),
  },
  ["archived"],
);
const getSpaceInputSchema = inputPayload({ spaceId: spaceIdField });
const listWorkspaceUsersInputSchema = inputPayload({
  workspaceId: workspaceIdField,
});
const getUserInputSchema = inputPayload(
  {
    workspaceId: workspaceIdField,
    userId: userIdField,
    includeShared: s.boolean("Whether to include items shared with the ClickUp user."),
  },
  ["includeShared"],
);
const listFoldersInputSchema = inputPayload(
  {
    spaceId: spaceIdField,
    archived: s.boolean("Whether to include archived ClickUp folders."),
  },
  ["archived"],
);
const getFolderInputSchema = inputPayload({ folderId: folderIdField });
const listListsInputSchema = inputPayload(
  {
    folderId: folderIdField,
    archived: s.boolean("Whether to include archived ClickUp lists."),
  },
  ["archived"],
);
const listFolderlessListsInputSchema = inputPayload(
  {
    spaceId: spaceIdField,
    archived: s.boolean("Whether to include archived ClickUp folderless lists."),
  },
  ["archived"],
);
const getListInputSchema = inputPayload({ listId: listIdField });
const getWorkspaceCustomFieldsInputSchema = inputPayload({
  workspaceId: workspaceIdField,
});
const getSpaceCustomFieldsInputSchema = inputPayload({ spaceId: spaceIdField });
const getFolderCustomFieldsInputSchema = inputPayload({
  folderId: folderIdField,
});
const getListCustomFieldsInputSchema = inputPayload({ listId: listIdField });
const setCustomFieldValueInputSchema = inputPayload(
  {
    taskId: taskIdField,
    fieldId: fieldIdField,
    value: { description: "The ClickUp custom field value." },
    valueOptions: customFieldValueOptionsSchema,
  },
  ["valueOptions"],
);
const removeCustomFieldValueInputSchema = inputPayload({
  taskId: taskIdField,
  fieldId: fieldIdField,
});
const createChecklistInputSchema = inputPayload({
  taskId: taskIdField,
  name: s.string("The ClickUp checklist name.", { minLength: 1 }),
});
const updateChecklistInputSchema = inputPayload(
  {
    checklistId: checklistIdField,
    name: s.string("The ClickUp checklist name."),
    position: s.integer("The ClickUp checklist position."),
  },
  ["name", "position"],
);
const deleteChecklistInputSchema = inputPayload({
  checklistId: checklistIdField,
});
const createChecklistItemInputSchema = inputPayload(
  {
    checklistId: checklistIdField,
    name: s.string("The ClickUp checklist item name.", { minLength: 1 }),
    assignee: s.integer("The ClickUp checklist item assignee user ID."),
  },
  ["assignee"],
);
const updateChecklistItemInputSchema = inputPayload(
  {
    checklistId: checklistIdField,
    checklistItemId: checklistItemIdField,
    name: s.string("The ClickUp checklist item name."),
    assignee: s.anyOf("The ClickUp checklist item assignee.", [
      s.string("The ClickUp checklist item assignee ID.", { minLength: 1 }),
      s.integer("The ClickUp checklist item assignee user ID."),
      {
        type: "null",
        description: "Clear the ClickUp checklist item assignee.",
      },
    ]),
    resolved: s.boolean("Whether the ClickUp checklist item is resolved."),
    parent: s.anyOf("The parent ClickUp checklist item ID.", [
      s.string("The parent ClickUp checklist item ID.", { minLength: 1 }),
      { type: "null", description: "Clear the parent ClickUp checklist item." },
    ]),
  },
  ["name", "assignee", "resolved", "parent"],
);
const deleteChecklistItemInputSchema = inputPayload({
  checklistId: checklistIdField,
  checklistItemId: checklistItemIdField,
});
const getSpaceTagsInputSchema = inputPayload({ spaceId: spaceIdField });
const taskTagMutationInputSchema = inputPayload({
  taskId: taskIdField,
  tagName: tagNameField,
});
const dependencyMutationInputSchema = inputPayload(
  {
    taskId: taskIdField,
    dependsOnTaskId: s.string("The ClickUp task ID that the task depends on."),
    dependencyOfTaskId: s.string("The ClickUp task ID that depends on the task."),
  },
  ["dependsOnTaskId", "dependencyOfTaskId"],
);
const taskLinkInputSchema = inputPayload({
  taskId: taskIdField,
  linksToTaskId: s.string("The ClickUp task ID to link to.", { minLength: 1 }),
});
const getCustomTaskTypesInputSchema = inputPayload({
  workspaceId: workspaceIdField,
});
const getViewInputSchema = inputPayload({ viewId: viewIdField });
const getViewTasksInputSchema = inputPayload(
  {
    viewId: viewIdField,
    page: s.integer("The zero-based ClickUp view task page index."),
  },
  ["page"],
);
const getSpaceViewsInputSchema = inputPayload({ spaceId: spaceIdField });
const getFolderViewsInputSchema = inputPayload({ folderId: folderIdField });
const getListViewsInputSchema = inputPayload({ listId: listIdField });
const getWorkspaceEverythingLevelViewsInputSchema = inputPayload({
  workspaceId: workspaceIdField,
});
const taskListMembershipInputSchema = inputPayload({
  listId: listIdField,
  taskId: taskIdField,
});
const moveTaskStatusMappingSchema = s.object("A ClickUp task move status mapping.", {
  sourceStatus: s.string("The source ClickUp status name.", { minLength: 1 }),
  destinationStatus: s.string("The destination ClickUp status name.", {
    minLength: 1,
  }),
});
const moveTaskToHomeListInputSchema = inputPayload(
  {
    workspaceId: workspaceIdField,
    taskId: taskIdField,
    listId: listIdField,
    moveCustomFields: s.boolean("Whether to move ClickUp custom fields to the destination home list."),
    customFieldsToMove: s.array(
      "The specific ClickUp custom field IDs to move.",
      s.string("A ClickUp custom field ID.", { minLength: 1 }),
      { minItems: 1 },
    ),
    statusMappings: s.array("The ClickUp status mappings to apply during the move.", moveTaskStatusMappingSchema, {
      minItems: 1,
    }),
  },
  ["moveCustomFields", "customFieldsToMove", "statusMappings"],
);
const createTaskAttachmentInputSchema = inputPayload(
  {
    taskId: taskIdField,
    fileName: s.string("The file name to use for the ClickUp attachment.", {
      minLength: 1,
    }),
    mimeType: s.string("The MIME type to use for the ClickUp attachment."),
    url: s.string("The public URL of the file to fetch before uploading."),
    contentText: s.string("The plain text content to upload as a file."),
    contentBase64: s.string("The Base64-encoded file content to upload."),
  },
  ["mimeType", "url", "contentText", "contentBase64"],
);
const getListMembersInputSchema = inputPayload({ listId: listIdField });
const getTaskMembersInputSchema = inputPayload({ taskId: taskIdField });
const createSpaceInputSchema = inputPayload({
  workspaceId: workspaceIdField,
  name: s.string("The ClickUp space name.", { minLength: 1 }),
  multipleAssignees: s.boolean("Whether the ClickUp space allows multiple assignees."),
  features: spaceFeaturesSchema,
});
const updateSpaceInputSchema = inputPayload(
  {
    spaceId: spaceIdField,
    name: s.string("The ClickUp space name."),
    color: s.string("The ClickUp space color."),
    private: s.boolean("Whether the ClickUp space is private."),
    adminCanManage: s.boolean("Whether ClickUp admins can manage members in the space."),
    multipleAssignees: s.boolean("Whether the ClickUp space allows multiple assignees."),
    features: spaceFeaturesSchema,
  },
  ["name", "color", "private", "adminCanManage", "multipleAssignees", "features"],
);
const deleteSpaceInputSchema = inputPayload({ spaceId: spaceIdField });
const createFolderInputSchema = inputPayload({
  spaceId: spaceIdField,
  name: s.string("The ClickUp folder name.", { minLength: 1 }),
});
const updateFolderInputSchema = inputPayload({
  folderId: folderIdField,
  name: s.string("The ClickUp folder name.", { minLength: 1 }),
});
const deleteFolderInputSchema = inputPayload({ folderId: folderIdField });
const createListBodyProperties = {
  name: s.string("The ClickUp list name.", { minLength: 1 }),
  content: s.string("The ClickUp list content."),
  markdownContent: s.string("The ClickUp Markdown list content."),
  dueDate: s.integer("The ClickUp due date timestamp in milliseconds."),
  dueDateTime: s.boolean("Whether the ClickUp due date includes time."),
  priority: priorityValue("The ClickUp list priority. Use 1 for urgent, 2 for high, 3 for normal, and 4 for low."),
  assignee: s.integer("The ClickUp assignee user ID."),
  status: s.string("The ClickUp list status name."),
};
const createListBodyOptional: string[] = [
  "content",
  "markdownContent",
  "dueDate",
  "dueDateTime",
  "priority",
  "assignee",
  "status",
];
const createListInputSchema = inputPayload(
  { folderId: folderIdField, ...createListBodyProperties },
  createListBodyOptional,
);
const createFolderlessListInputSchema = inputPayload(
  { spaceId: spaceIdField, ...createListBodyProperties },
  createListBodyOptional,
);
const getTaskTemplatesInputSchema = inputPayload({
  workspaceId: workspaceIdField,
  page: s.integer("The zero-based ClickUp page index."),
});
const createTaskFromTemplateInputSchema = inputPayload({
  listId: listIdField,
  templateId: templateIdField,
  name: s.string("The ClickUp task name.", { minLength: 1 }),
});
const listTemplateOptionsSchema = s.object(
  "The ClickUp list template instantiation options.",
  {
    returnImmediately: s.boolean("Whether to return the ClickUp list ID before the template finishes applying."),
  },
  { optional: ["returnImmediately"] },
);
const createListFromTemplateInputSchema = inputPayload(
  {
    folderId: folderIdField,
    templateId: templateIdField,
    name: s.string("The ClickUp list name.", { minLength: 1 }),
    options: listTemplateOptionsSchema,
  },
  ["options"],
);
const updateListInputSchema = inputPayload(
  {
    listId: listIdField,
    name: s.string("The ClickUp list name."),
    content: s.string("The ClickUp list content."),
    markdownContent: s.string("The ClickUp Markdown list content."),
    dueDate: s.integer("The ClickUp due date timestamp in milliseconds."),
    dueDateTime: s.boolean("Whether the ClickUp due date includes time."),
    priority: priorityValue("The ClickUp list priority. Use 1 for urgent, 2 for high, 3 for normal, and 4 for low."),
    assignee: s.anyOf('The ClickUp assignee value. Use "none" to clear the assignee.', [
      s.integer("The ClickUp assignee user ID."),
      {
        type: "string",
        const: "none",
        description: "Clear the ClickUp assignee.",
      },
    ]),
    status: s.string("The ClickUp list status name."),
    unsetStatus: s.boolean("Whether to clear the ClickUp list status."),
  },
  ["name", "content", "markdownContent", "dueDate", "dueDateTime", "priority", "assignee", "status", "unsetStatus"],
);
const deleteListInputSchema = inputPayload({ listId: listIdField });
const listTaskFilterProperties = {
  page: s.integer("The zero-based ClickUp page index."),
  orderBy: s.stringEnum("The ClickUp task ordering field.", ["id", "created", "updated", "due_date"]),
  reverse: s.boolean("Whether to reverse the ClickUp task ordering."),
  subtasks: s.boolean("Whether to include ClickUp subtasks."),
  statuses: optionalStringArrayField("The ClickUp task statuses to filter by."),
  includeClosed: s.boolean("Whether to include closed ClickUp tasks."),
  assigneeIds: optionalIntegerArrayField("The ClickUp assignee user IDs to filter by."),
  tags: optionalStringArrayField("The ClickUp tag names to filter by."),
  dueDateGt: s.integer("The minimum ClickUp due date timestamp in milliseconds."),
  dueDateLt: s.integer("The maximum ClickUp due date timestamp in milliseconds."),
  dateCreatedGt: s.integer("The minimum ClickUp creation timestamp in milliseconds."),
  dateCreatedLt: s.integer("The maximum ClickUp creation timestamp in milliseconds."),
  dateUpdatedGt: s.integer("The minimum ClickUp update timestamp in milliseconds."),
  dateUpdatedLt: s.integer("The maximum ClickUp update timestamp in milliseconds."),
  dateDoneGt: s.integer("The minimum ClickUp done timestamp in milliseconds."),
  dateDoneLt: s.integer("The maximum ClickUp done timestamp in milliseconds."),
  parentTaskId: s.string("The ClickUp parent task ID to filter by."),
  includeMarkdownDescription: s.boolean("Whether to request ClickUp Markdown task descriptions."),
};
const listTaskFilterOptional = Object.keys(listTaskFilterProperties);
const listListTasksInputSchema = inputPayload(
  {
    listId: listIdField,
    ...listTaskFilterProperties,
    includeTiml: s.boolean("Whether to include ClickUp tasks that exist in multiple lists."),
    watchers: optionalIntegerArrayField("The ClickUp watcher user IDs to filter by."),
  },
  [...listTaskFilterOptional, "includeTiml", "watchers"],
);
const listWorkspaceTasksInputSchema = inputPayload(
  {
    workspaceId: workspaceIdField,
    ...listTaskFilterProperties,
    spaceIds: optionalStringArrayField("The ClickUp space IDs to filter by."),
    folderIds: optionalStringArrayField("The ClickUp folder IDs to filter by."),
    listIds: optionalStringArrayField("The ClickUp list IDs to filter by."),
  },
  [...listTaskFilterOptional, "spaceIds", "folderIds", "listIds"],
);
const getTaskInputSchema = inputPayload(
  {
    taskId: taskIdField,
    includeSubtasks: s.boolean("Whether to include ClickUp subtasks."),
    includeMarkdownDescription: s.boolean("Whether to request ClickUp Markdown task descriptions."),
  },
  ["includeSubtasks", "includeMarkdownDescription"],
);
const deleteTaskInputSchema = inputPayload({ taskId: taskIdField });
const groupAssigneeField = stringOrInteger("The ClickUp group assignee ID.");
const getTaskCommentsInputSchema = inputPayload(
  {
    taskId: taskIdField,
    start: s.integer("The ClickUp comment timestamp for pagination."),
    startId: s.string("The ClickUp comment ID for pagination."),
  },
  ["start", "startId"],
);
const createTaskCommentInputSchema = inputPayload(
  {
    taskId: taskIdField,
    commentText: s.string("The ClickUp comment text.", { minLength: 1 }),
    assignee: s.integer("The ClickUp assignee user ID."),
    groupAssignee: groupAssigneeField,
    notifyAll: s.boolean("Whether to notify all ClickUp watchers."),
  },
  ["assignee", "groupAssignee"],
);
const createThreadedCommentInputSchema = inputPayload(
  {
    commentId: commentIdField,
    commentText: s.string("The ClickUp comment text.", { minLength: 1 }),
    assignee: s.integer("The ClickUp assignee user ID."),
    groupAssignee: groupAssigneeField,
    notifyAll: s.boolean("Whether to notify all ClickUp watchers."),
  },
  ["assignee", "groupAssignee"],
);
const getThreadedCommentsInputSchema = inputPayload({
  commentId: commentIdField,
});
const updateCommentInputSchema = inputPayload(
  {
    commentId: commentIdField,
    commentText: s.string("The ClickUp comment text.", { minLength: 1 }),
    assignee: s.integer("The ClickUp assignee user ID."),
    groupAssignee: groupAssigneeField,
    resolved: s.boolean("Whether the ClickUp comment is resolved."),
  },
  ["assignee", "groupAssignee", "resolved"],
);
const deleteCommentInputSchema = inputPayload({ commentId: commentIdField });
const customFieldValueSchema = s.looseRequiredObject("A ClickUp custom field value object.", {});
const createTaskInputSchema = inputPayload(
  {
    listId: listIdField,
    name: s.string("The ClickUp task name.", { minLength: 1 }),
    description: s.string("The ClickUp task description."),
    markdownContent: s.string("The ClickUp task Markdown description."),
    assigneeIds: optionalIntegerArrayField("The ClickUp assignee user IDs."),
    groupAssigneeIds: optionalIntegerArrayField("The ClickUp group assignee IDs."),
    tags: optionalStringArrayField("The ClickUp tag names."),
    status: s.string("The ClickUp task status name."),
    priority: nullablePriorityValue(
      "The ClickUp task priority. Use 1 for urgent, 2 for high, 3 for normal, 4 for low, or null to clear it.",
    ),
    dueDate: s.integer("The ClickUp due date timestamp in milliseconds."),
    dueDateTime: s.boolean("Whether the ClickUp due date includes time."),
    startDate: s.integer("The ClickUp start date timestamp in milliseconds."),
    startDateTime: s.boolean("Whether the ClickUp start date includes time."),
    notifyAll: s.boolean("Whether to notify all ClickUp watchers."),
    parentTaskId: nullableStringField("The ClickUp parent task ID."),
    linksToTaskId: nullableStringField("The ClickUp dependency target task ID."),
    timeEstimate: s.integer("The ClickUp time estimate in milliseconds."),
    points: s.number("The ClickUp points value."),
    customFields: s.array("The ClickUp custom field values.", customFieldValueSchema),
    customItemId: s.integer("The ClickUp custom item type ID."),
    checkRequiredCustomFields: s.boolean("Whether to enforce required ClickUp custom fields."),
  },
  [
    "description",
    "markdownContent",
    "assigneeIds",
    "groupAssigneeIds",
    "tags",
    "status",
    "priority",
    "dueDate",
    "dueDateTime",
    "startDate",
    "startDateTime",
    "notifyAll",
    "parentTaskId",
    "linksToTaskId",
    "timeEstimate",
    "points",
    "customFields",
    "customItemId",
    "checkRequiredCustomFields",
  ],
);
const updateTaskInputSchema = inputPayload(
  {
    taskId: taskIdField,
    name: s.string("The ClickUp task name."),
    description: s.string('The ClickUp task description. Use " " to clear it.'),
    markdownContent: s.string("The ClickUp task Markdown description."),
    status: s.string("The ClickUp task status name."),
    priority: priorityValue("The ClickUp task priority. Use 1 for urgent, 2 for high, 3 for normal, and 4 for low."),
    dueDate: s.integer("The ClickUp due date timestamp in milliseconds."),
    dueDateTime: s.boolean("Whether the ClickUp due date includes time."),
    startDate: s.integer("The ClickUp start date timestamp in milliseconds."),
    startDateTime: s.boolean("Whether the ClickUp start date includes time."),
    archived: s.boolean("Whether the ClickUp task is archived."),
    parentTaskId: s.string("The ClickUp parent task ID."),
    timeEstimate: s.integer("The ClickUp time estimate in milliseconds."),
    points: s.number("The ClickUp points value."),
    assigneeIdsToAdd: optionalIntegerArrayField("The ClickUp assignee user IDs to add."),
    assigneeIdsToRemove: optionalIntegerArrayField("The ClickUp assignee user IDs to remove."),
    customItemId: s.nullable(s.integer("The ClickUp custom item type ID.")),
  },
  [
    "name",
    "description",
    "markdownContent",
    "status",
    "priority",
    "dueDate",
    "dueDateTime",
    "startDate",
    "startDateTime",
    "archived",
    "parentTaskId",
    "timeEstimate",
    "points",
    "assigneeIdsToAdd",
    "assigneeIdsToRemove",
    "customItemId",
  ],
);

export const clickupActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated ClickUp user profile.",
    requiredScopes: readScope,
    inputSchema: emptyInputSchema,
    outputSchema: outputPayload({ user: userSchema("The ClickUp user.") }),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List the ClickUp workspaces available to the authenticated user.",
    requiredScopes: readScope,
    inputSchema: emptyInputSchema,
    outputSchema: outputPayload({
      workspaces: s.array("The ClickUp workspaces.", workspaceSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "list_workspace_users",
    description: "List the members visible on a ClickUp workspace.",
    requiredScopes: readScope,
    inputSchema: listWorkspaceUsersInputSchema,
    outputSchema: outputPayload({
      members: s.array("The ClickUp members visible on the workspace.", workspaceMemberSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a ClickUp workspace user by user ID.",
    requiredScopes: readScope,
    inputSchema: getUserInputSchema,
    outputSchema: outputPayload({
      member: workspaceUserMemberSchema("The ClickUp workspace user member."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_spaces",
    description: "List the ClickUp spaces available in a workspace.",
    requiredScopes: readScope,
    inputSchema: listSpacesInputSchema,
    outputSchema: outputPayload({
      spaces: s.array("The ClickUp spaces.", spaceSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_space",
    description: "Get a ClickUp space by space ID.",
    requiredScopes: readScope,
    inputSchema: getSpaceInputSchema,
    outputSchema: outputPayload({ space: spaceSchema("The ClickUp space.") }),
  }),
  defineProviderAction(service, {
    name: "create_space",
    description: "Create a ClickUp space in a workspace.",
    requiredScopes: writeScope,
    inputSchema: createSpaceInputSchema,
    outputSchema: outputPayload({
      space: spaceSchema("The created ClickUp space."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_space",
    description: "Update a ClickUp space by space ID.",
    requiredScopes: writeScope,
    inputSchema: updateSpaceInputSchema,
    outputSchema: outputPayload({
      space: spaceSchema("The updated ClickUp space."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_space",
    description: "Delete a ClickUp space by space ID.",
    requiredScopes: writeScope,
    inputSchema: deleteSpaceInputSchema,
    outputSchema: outputPayload({
      deleted: s.boolean("Whether the ClickUp space was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_folders",
    description: "List the ClickUp folders available in a space.",
    requiredScopes: readScope,
    inputSchema: listFoldersInputSchema,
    outputSchema: outputPayload({
      folders: s.array("The ClickUp folders.", folderSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_folder",
    description: "Get a ClickUp folder by folder ID.",
    requiredScopes: readScope,
    inputSchema: getFolderInputSchema,
    outputSchema: outputPayload({
      folder: folderSchema("The ClickUp folder."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_folder",
    description: "Create a ClickUp folder in a space.",
    requiredScopes: writeScope,
    inputSchema: createFolderInputSchema,
    outputSchema: outputPayload({
      folder: folderSchema("The created ClickUp folder."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_folder",
    description: "Update a ClickUp folder by folder ID.",
    requiredScopes: writeScope,
    inputSchema: updateFolderInputSchema,
    outputSchema: outputPayload({
      folder: folderSchema("The updated ClickUp folder."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_folder",
    description: "Delete a ClickUp folder by folder ID.",
    requiredScopes: writeScope,
    inputSchema: deleteFolderInputSchema,
    outputSchema: outputPayload({
      deleted: s.boolean("Whether the ClickUp folder was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List the ClickUp lists available in a folder.",
    requiredScopes: readScope,
    inputSchema: listListsInputSchema,
    outputSchema: outputPayload({
      lists: s.array("The ClickUp lists.", listSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "list_folderless_lists",
    description: "List the ClickUp folderless lists available in a space.",
    requiredScopes: readScope,
    inputSchema: listFolderlessListsInputSchema,
    outputSchema: outputPayload({
      lists: s.array("The ClickUp folderless lists.", listSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Get a ClickUp list by list ID.",
    requiredScopes: readScope,
    inputSchema: getListInputSchema,
    outputSchema: outputPayload({ list: listSchema("The ClickUp list.") }),
  }),
  defineProviderAction(service, {
    name: "get_workspace_custom_fields",
    description: "Get the ClickUp custom fields available on a workspace.",
    requiredScopes: readScope,
    inputSchema: getWorkspaceCustomFieldsInputSchema,
    outputSchema: outputPayload({
      fields: s.array("The ClickUp workspace custom fields.", customFieldSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_space_custom_fields",
    description: "Get the ClickUp custom fields available on a space.",
    requiredScopes: readScope,
    inputSchema: getSpaceCustomFieldsInputSchema,
    outputSchema: outputPayload({
      fields: s.array("The ClickUp space custom fields.", customFieldSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_folder_custom_fields",
    description: "Get the ClickUp custom fields available on a folder.",
    requiredScopes: readScope,
    inputSchema: getFolderCustomFieldsInputSchema,
    outputSchema: outputPayload({
      fields: s.array("The ClickUp folder custom fields.", customFieldSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list_custom_fields",
    description: "Get the ClickUp custom fields available on a list.",
    requiredScopes: readScope,
    inputSchema: getListCustomFieldsInputSchema,
    outputSchema: outputPayload({
      fields: s.array("The ClickUp list custom fields.", customFieldSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "set_custom_field_value",
    description: "Set a ClickUp custom field value on a task.",
    requiredScopes: writeScope,
    inputSchema: setCustomFieldValueInputSchema,
    outputSchema: outputPayload({
      updated: s.boolean("Whether the ClickUp custom field value was updated."),
    }),
  }),
  defineProviderAction(service, {
    name: "remove_custom_field_value",
    description: "Remove a ClickUp custom field value from a task.",
    requiredScopes: writeScope,
    inputSchema: removeCustomFieldValueInputSchema,
    outputSchema: outputPayload({
      removed: s.boolean("Whether the ClickUp custom field value was removed."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_checklist",
    description: "Create a checklist on a ClickUp task.",
    requiredScopes: writeScope,
    inputSchema: createChecklistInputSchema,
    outputSchema: outputPayload({
      checklist: checklistSchema("The created ClickUp checklist."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_checklist",
    description: "Update a ClickUp checklist by checklist ID.",
    requiredScopes: writeScope,
    inputSchema: updateChecklistInputSchema,
    outputSchema: outputPayload({
      updated: s.boolean("Whether the ClickUp checklist was updated."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_checklist",
    description: "Delete a ClickUp checklist by checklist ID.",
    requiredScopes: writeScope,
    inputSchema: deleteChecklistInputSchema,
    outputSchema: outputPayload({
      deleted: s.boolean("Whether the ClickUp checklist was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_checklist_item",
    description: "Create a checklist item on a ClickUp checklist.",
    requiredScopes: writeScope,
    inputSchema: createChecklistItemInputSchema,
    outputSchema: outputPayload({
      checklist: checklistSchema("The ClickUp checklist after item creation."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_checklist_item",
    description: "Update a ClickUp checklist item by checklist item ID.",
    requiredScopes: writeScope,
    inputSchema: updateChecklistItemInputSchema,
    outputSchema: outputPayload({
      checklist: checklistSchema("The ClickUp checklist after item update."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_checklist_item",
    description: "Delete a ClickUp checklist item by checklist item ID.",
    requiredScopes: writeScope,
    inputSchema: deleteChecklistItemInputSchema,
    outputSchema: outputPayload({
      deleted: s.boolean("Whether the ClickUp checklist item was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_space_tags",
    description: "Get the ClickUp tags available on a space.",
    requiredScopes: readScope,
    inputSchema: getSpaceTagsInputSchema,
    outputSchema: outputPayload({
      tags: s.array("The ClickUp space tags.", taskTagSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "add_tag_to_task",
    description: "Add a ClickUp tag to a task.",
    requiredScopes: writeScope,
    inputSchema: taskTagMutationInputSchema,
    outputSchema: outputPayload({
      added: s.boolean("Whether the ClickUp tag was added to the task."),
    }),
  }),
  defineProviderAction(service, {
    name: "remove_tag_from_task",
    description: "Remove a ClickUp tag from a task.",
    requiredScopes: writeScope,
    inputSchema: taskTagMutationInputSchema,
    outputSchema: outputPayload({
      removed: s.boolean("Whether the ClickUp tag was removed from the task."),
    }),
  }),
  defineProviderAction(service, {
    name: "add_dependency",
    description: "Add a ClickUp dependency relationship to a task.",
    requiredScopes: writeScope,
    inputSchema: dependencyMutationInputSchema,
    outputSchema: outputPayload({
      added: s.boolean("Whether the ClickUp dependency was added."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_dependency",
    description: "Delete a ClickUp dependency relationship from a task.",
    requiredScopes: writeScope,
    inputSchema: dependencyMutationInputSchema,
    outputSchema: outputPayload({
      deleted: s.boolean("Whether the ClickUp dependency was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "add_task_link",
    description: "Add a ClickUp task link to a task.",
    requiredScopes: writeScope,
    inputSchema: taskLinkInputSchema,
    outputSchema: outputPayload({
      task: taskSchema("The ClickUp task after the link was added."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_task_link",
    description: "Delete a ClickUp task link from a task.",
    requiredScopes: writeScope,
    inputSchema: taskLinkInputSchema,
    outputSchema: outputPayload({
      task: taskSchema("The ClickUp task after the link was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_custom_task_types",
    description: "Get the ClickUp custom task types available on a workspace.",
    requiredScopes: readScope,
    inputSchema: getCustomTaskTypesInputSchema,
    outputSchema: outputPayload({
      customTaskTypes: s.array("The ClickUp custom task types.", customTaskTypeSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_view",
    description: "Get a ClickUp view by view ID.",
    requiredScopes: readScope,
    inputSchema: getViewInputSchema,
    outputSchema: outputPayload({ view: viewSchema("The ClickUp view.") }),
  }),
  defineProviderAction(service, {
    name: "get_view_tasks",
    description: "Get the visible ClickUp tasks in a view.",
    requiredScopes: readScope,
    inputSchema: getViewTasksInputSchema,
    outputSchema: outputPayload(
      {
        tasks: s.array("The ClickUp view tasks.", taskSchema()),
        lastPage: s.boolean("Whether the ClickUp response is the last page."),
      },
      ["lastPage"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_space_views",
    description: "Get the ClickUp views available on a space.",
    requiredScopes: readScope,
    inputSchema: getSpaceViewsInputSchema,
    outputSchema: outputPayload({
      views: s.array("The ClickUp space views.", viewSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_folder_views",
    description: "Get the ClickUp views available on a folder.",
    requiredScopes: readScope,
    inputSchema: getFolderViewsInputSchema,
    outputSchema: outputPayload({
      views: s.array("The ClickUp folder views.", viewSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list_views",
    description: "Get the ClickUp views available on a list.",
    requiredScopes: readScope,
    inputSchema: getListViewsInputSchema,
    outputSchema: outputPayload({
      views: s.array("The ClickUp list views.", viewSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "get_workspace_everything_level_views",
    description: "Get the ClickUp everything-level views available on a workspace.",
    requiredScopes: readScope,
    inputSchema: getWorkspaceEverythingLevelViewsInputSchema,
    outputSchema: outputPayload({
      views: s.array("The ClickUp everything-level workspace views.", viewSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "add_task_to_list",
    description: "Add a ClickUp task to an additional list.",
    requiredScopes: writeScope,
    inputSchema: taskListMembershipInputSchema,
    outputSchema: outputPayload({
      added: s.boolean("Whether the ClickUp task was added to the list."),
    }),
  }),
  defineProviderAction(service, {
    name: "remove_task_from_list",
    description: "Remove a ClickUp task from an additional list.",
    requiredScopes: writeScope,
    inputSchema: taskListMembershipInputSchema,
    outputSchema: outputPayload({
      removed: s.boolean("Whether the ClickUp task was removed from the list."),
    }),
  }),
  defineProviderAction(service, {
    name: "move_task_to_home_list",
    description: "Move a ClickUp task to a new home list.",
    requiredScopes: writeScope,
    inputSchema: moveTaskToHomeListInputSchema,
    outputSchema: outputPayload({
      task: taskSchema("The ClickUp task after moving to the new home list."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_task_attachment",
    description: "Upload an attachment file to a ClickUp task.",
    requiredScopes: writeScope,
    inputSchema: createTaskAttachmentInputSchema,
    outputSchema: outputPayload({
      attachment: attachmentSchema("The uploaded ClickUp attachment."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_list",
    description: "Create a ClickUp list in a folder.",
    requiredScopes: writeScope,
    inputSchema: createListInputSchema,
    outputSchema: outputPayload({
      list: listSchema("The created ClickUp list."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_folderless_list",
    description: "Create a ClickUp folderless list in a space.",
    requiredScopes: writeScope,
    inputSchema: createFolderlessListInputSchema,
    outputSchema: outputPayload({
      list: listSchema("The created ClickUp folderless list."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_list",
    description: "Update a ClickUp list by list ID.",
    requiredScopes: writeScope,
    inputSchema: updateListInputSchema,
    outputSchema: outputPayload({
      list: listSchema("The updated ClickUp list."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_list",
    description: "Delete a ClickUp list by list ID.",
    requiredScopes: writeScope,
    inputSchema: deleteListInputSchema,
    outputSchema: outputPayload({
      deleted: s.boolean("Whether the ClickUp list was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_templates",
    description: "Get the ClickUp task templates available in a workspace.",
    requiredScopes: readScope,
    inputSchema: getTaskTemplatesInputSchema,
    outputSchema: outputPayload({
      templates: s.array("The ClickUp task templates.", taskTemplateSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "create_task_from_template",
    description: "Create a ClickUp task from a task template.",
    requiredScopes: writeScope,
    inputSchema: createTaskFromTemplateInputSchema,
    outputSchema: outputPayload(
      {
        created: s.boolean("Whether the ClickUp task was created from the template."),
        task: taskSchema("The created ClickUp task."),
      },
      ["task"],
    ),
  }),
  defineProviderAction(service, {
    name: "create_list_from_template",
    description: "Create a ClickUp list from a folder list template.",
    requiredScopes: writeScope,
    inputSchema: createListFromTemplateInputSchema,
    outputSchema: outputPayload({
      list: listSchema("The created ClickUp list."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list_members",
    description: "Get the ClickUp members with explicit access to a list.",
    requiredScopes: readScope,
    inputSchema: getListMembersInputSchema,
    outputSchema: outputPayload({
      members: s.array("The ClickUp list members.", memberProfileSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "list_list_tasks",
    description: "List the ClickUp tasks in a list with optional filters.",
    requiredScopes: readScope,
    inputSchema: listListTasksInputSchema,
    outputSchema: outputPayload(
      {
        tasks: s.array("The ClickUp tasks.", taskSchema()),
        lastPage: s.boolean("Whether the ClickUp response is the last page."),
      },
      ["lastPage"],
    ),
  }),
  defineProviderAction(service, {
    name: "list_workspace_tasks",
    description: "List the ClickUp tasks in a workspace with official filter parameters.",
    requiredScopes: readScope,
    inputSchema: listWorkspaceTasksInputSchema,
    outputSchema: outputPayload(
      {
        tasks: s.array("The ClickUp tasks.", taskSchema()),
        lastPage: s.boolean("Whether the ClickUp response is the last page."),
      },
      ["lastPage"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get a ClickUp task by task ID.",
    requiredScopes: readScope,
    inputSchema: getTaskInputSchema,
    outputSchema: outputPayload({ task: taskSchema("The ClickUp task.") }),
  }),
  defineProviderAction(service, {
    name: "get_task_members",
    description: "Get the ClickUp members with explicit access to a task.",
    requiredScopes: readScope,
    inputSchema: getTaskMembersInputSchema,
    outputSchema: outputPayload({
      members: s.array("The ClickUp task members.", memberProfileSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete a ClickUp task by task ID.",
    requiredScopes: writeScope,
    inputSchema: deleteTaskInputSchema,
    outputSchema: outputPayload({
      deleted: s.boolean("Whether the ClickUp task was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_comments",
    description: "Get the comments on a ClickUp task.",
    requiredScopes: readScope,
    inputSchema: getTaskCommentsInputSchema,
    outputSchema: outputPayload({
      comments: s.array("The ClickUp task comments.", commentSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "create_task_comment",
    description: "Create a comment on a ClickUp task.",
    requiredScopes: writeScope,
    inputSchema: createTaskCommentInputSchema,
    outputSchema: outputPayload({
      comment: commentMutationReceiptSchema("The created ClickUp comment."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_threaded_comment",
    description: "Create a threaded reply on a ClickUp comment.",
    requiredScopes: writeScope,
    inputSchema: createThreadedCommentInputSchema,
    outputSchema: outputPayload({
      comment: commentMutationReceiptSchema("The created ClickUp threaded comment."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_threaded_comments",
    description: "Get the threaded replies on a ClickUp comment.",
    requiredScopes: readScope,
    inputSchema: getThreadedCommentsInputSchema,
    outputSchema: outputPayload({
      comments: s.array("The ClickUp threaded comments.", commentSchema()),
    }),
  }),
  defineProviderAction(service, {
    name: "update_comment",
    description: "Update a ClickUp comment by comment ID.",
    requiredScopes: writeScope,
    inputSchema: updateCommentInputSchema,
    outputSchema: outputPayload({
      comment: commentMutationReceiptSchema("The updated ClickUp comment."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_comment",
    description: "Delete a ClickUp comment by comment ID.",
    requiredScopes: writeScope,
    inputSchema: deleteCommentInputSchema,
    outputSchema: outputPayload({
      deleted: s.boolean("Whether the ClickUp comment was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a ClickUp task in a list with optional scheduling and assignee fields.",
    requiredScopes: writeScope,
    inputSchema: createTaskInputSchema,
    outputSchema: outputPayload({
      task: taskSchema("The created ClickUp task."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a ClickUp task by task ID.",
    requiredScopes: writeScope,
    inputSchema: updateTaskInputSchema,
    outputSchema: outputPayload({
      task: taskSchema("The updated ClickUp task."),
    }),
  }),
];
