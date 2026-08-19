import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { todoistOAuthScopes } from "./scopes.ts";

const service = "todoist";

const colorNames = [
  "berry_red",
  "red",
  "orange",
  "yellow",
  "olive_green",
  "lime_green",
  "green",
  "mint_green",
  "teal",
  "sky_blue",
  "light_blue",
  "blue",
  "grape",
  "violet",
  "lavender",
  "magenta",
  "salmon",
  "charcoal",
  "grey",
  "taupe",
];

const nonEmpty = (description: string): JsonSchema => s.nonEmptyString(description);
const nullableString = (description: string): JsonSchema => s.nullable(s.string(description));
const integerLike = (description: string): JsonSchema =>
  s.union([s.integer(description), s.nonEmptyString(description)], { description });
const optionalCursor = s.nonEmptyString("Opaque pagination cursor returned by a previous Todoist response.");
const optionalLimit = s.integer("Maximum number of Todoist results to return in one page.", {
  minimum: 1,
  maximum: 200,
});
const color = s.union(
  [
    s.stringEnum("Todoist color name.", colorNames),
    s.integer("Todoist legacy numeric color code.", { minimum: 30, maximum: 49 }),
  ],
  {
    description: "Todoist color value as a named palette entry or legacy numeric code.",
  },
);
const viewStyle = s.stringEnum("Todoist project view style.", ["list", "board", "calendar"]);
const durationUnit = s.stringEnum("Todoist duration unit.", ["minute", "day"]);
const rawObject = s.looseObject("The raw Todoist object returned by the API.");
const paginated = (key: string, itemDescription: string): JsonSchema =>
  s.object({
    [key]: s.array(`The Todoist ${key} returned for the page.`, s.looseObject(itemDescription)),
    nextCursor: s.nullableString("Cursor for the next page, or null when no further page exists."),
  });

const noInput = s.object("The input payload for this action.", {});
const projectLookup = s.object("The input payload for this action.", { projectId: nonEmpty("Todoist project ID.") });
const sectionLookup = s.object("The input payload for this action.", { sectionId: nonEmpty("Todoist section ID.") });
const taskLookup = s.object("The input payload for this action.", { taskId: nonEmpty("Todoist task ID.") });
const commentLookup = s.object("The input payload for this action.", { commentId: nonEmpty("Todoist comment ID.") });

const listProjectsInput = s.object(
  "The input payload for this action.",
  {
    folderId: integerLike("Optional Todoist folder ID to filter projects by."),
    workspaceId: integerLike("Optional Todoist workspace ID to filter projects by."),
    cursor: optionalCursor,
    limit: optionalLimit,
  },
  { optional: ["folderId", "workspaceId", "cursor", "limit"] },
);

const projectWriteFields: Record<string, JsonSchema> = {
  name: nonEmpty("Todoist project name."),
  description: s.string("Todoist project description."),
  parentId: nullableString("Parent project ID, or null where the API supports clearing it."),
  color,
  isFavorite: s.boolean("Whether the project is a favorite."),
  viewStyle,
  workspaceId: integerLike("Todoist workspace ID for creating a workspace-scoped project."),
};

const createProjectInput = s.object("The input payload for this action.", projectWriteFields, {
  required: ["name"],
  optional: ["description", "parentId", "color", "isFavorite", "viewStyle", "workspaceId"],
});

const updateProjectInput = s.object(
  "The input payload for this action.",
  {
    projectId: nonEmpty("Todoist project ID."),
    name: nullableString("Updated project name."),
    description: nullableString("Updated project description."),
    color: s.nullable(color),
    isFavorite: s.nullableBoolean("Updated favorite flag."),
    viewStyle: s.nullable(viewStyle),
    childOrder: s.nullableInteger("Updated project order among sibling projects."),
    isCollapsed: s.nullableBoolean("Updated collapsed state of the project."),
    folderId: s.nullableInteger("Updated folder ID for a workspace project."),
  },
  { optional: ["name", "description", "color", "isFavorite", "viewStyle", "childOrder", "isCollapsed", "folderId"] },
);

const listSectionsInput = s.object(
  "The input payload for this action.",
  {
    projectId: nonEmpty("Optional Todoist project ID."),
    cursor: optionalCursor,
    limit: optionalLimit,
  },
  { optional: ["projectId", "cursor", "limit"] },
);

const createSectionInput = s.object(
  "The input payload for this action.",
  {
    projectId: nonEmpty("Todoist project ID that will own the section."),
    name: nonEmpty("Todoist section name."),
    order: s.integer("Optional section order within the project."),
  },
  { optional: ["order"] },
);

const updateSectionInput = s.object(
  "The input payload for this action.",
  {
    sectionId: nonEmpty("Todoist section ID."),
    name: nullableString("Updated section name."),
    sectionOrder: s.nullableInteger("Updated section order."),
    isCollapsed: s.nullableBoolean("Updated collapsed state of the section."),
  },
  { optional: ["name", "sectionOrder", "isCollapsed"] },
);

const listTasksInput = s.object(
  "The input payload for this action.",
  {
    projectId: nonEmpty("Optional Todoist project ID filter."),
    sectionId: nonEmpty("Optional Todoist section ID filter."),
    parentId: nonEmpty("Optional Todoist parent task ID filter."),
    label: nonEmpty("Optional Todoist label name filter."),
    ids: s.stringArray("Explicit Todoist task IDs to fetch.", { minItems: 1 }),
    goalId: nonEmpty("Optional Todoist goal ID filter."),
    cursor: optionalCursor,
    limit: optionalLimit,
  },
  { optional: ["projectId", "sectionId", "parentId", "label", "ids", "goalId", "cursor", "limit"] },
);

const taskBodyFields: Record<string, JsonSchema> = {
  content: nonEmpty("Todoist task title."),
  description: s.string("Todoist task description."),
  projectId: nonEmpty("Project ID that will own the task."),
  sectionId: nonEmpty("Section ID that will own the task."),
  parentId: nonEmpty("Parent task ID."),
  order: s.integer("Task order."),
  labels: s.stringArray("Todoist label names to attach.", { minItems: 1 }),
  priority: s.integer("Todoist priority from 1 to 4.", { minimum: 1, maximum: 4 }),
  assigneeId: s.nullableInteger("Todoist user ID to assign, or null where supported."),
  dueString: nonEmpty("Natural language due date string."),
  dueDate: s.date("Due date in YYYY-MM-DD format."),
  dueDatetime: s.dateTime("Due date-time in RFC 3339 form."),
  dueLang: nonEmpty("Language code used to parse the due string."),
  duration: s.integer("Duration amount."),
  durationUnit,
  deadlineDate: s.date("Deadline date in YYYY-MM-DD format."),
  childOrder: s.integer("Task order among siblings."),
  isCollapsed: s.boolean("Whether subtasks are collapsed."),
  dayOrder: s.integer("Task order in Today and Upcoming."),
};

const createTaskInput = s.object("The input payload for this action.", taskBodyFields, {
  required: ["content"],
  optional: Object.keys(taskBodyFields).filter((key) => key !== "content"),
});

const updateTaskInput = s.object(
  "The input payload for this action.",
  { taskId: nonEmpty("Todoist task ID."), ...taskBodyFields },
  { optional: Object.keys(taskBodyFields) },
);

const listCommentsInput = s.object(
  "The input payload for this action.",
  {
    taskId: nonEmpty("Optional task ID filter."),
    projectId: nonEmpty("Optional project ID filter."),
    cursor: optionalCursor,
    limit: optionalLimit,
  },
  { optional: ["taskId", "projectId", "cursor", "limit"] },
);

const attachmentInput = s.object(
  "Todoist comment attachment metadata.",
  {
    fileUrl: s.url("Attachment download URL."),
    fileName: s.string("Attachment file name."),
    fileType: s.string("Attachment MIME type."),
    resourceType: s.string("Attachment resource type."),
  },
  { optional: ["fileUrl", "fileName", "fileType", "resourceType"] },
);

const createCommentInput = s.object(
  "The input payload for this action.",
  {
    content: nonEmpty("Todoist comment content."),
    taskId: nonEmpty("Task ID that owns the comment."),
    projectId: nonEmpty("Project ID that owns the comment."),
    attachment: attachmentInput,
    uidsToNotify: s.array("Todoist user IDs to notify.", s.integer("A Todoist user ID."), { minItems: 1 }),
  },
  { optional: ["taskId", "projectId", "attachment", "uidsToNotify"] },
);

const updateCommentInput = s.object("The input payload for this action.", {
  commentId: nonEmpty("Todoist comment ID."),
  content: nonEmpty("Updated Todoist comment content."),
});

const listLabelsInput = s.object(
  "The input payload for this action.",
  {
    cursor: optionalCursor,
    limit: optionalLimit,
  },
  { optional: ["cursor", "limit"] },
);

export const todoistActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Todoist user profile.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: noInput,
    outputSchema: s.object({ user: rawObject }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Todoist projects visible to the connected account.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: listProjectsInput,
    outputSchema: paginated("projects", "A Todoist project."),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Todoist project by ID.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: projectLookup,
    outputSchema: s.object({ project: rawObject }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Todoist project.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: createProjectInput,
    outputSchema: s.object({ project: rawObject }),
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update a Todoist project.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: updateProjectInput,
    outputSchema: s.object({ project: rawObject }),
  }),
  defineProviderAction(service, {
    name: "list_sections",
    description: "List Todoist sections, optionally scoped to a project.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: listSectionsInput,
    outputSchema: paginated("sections", "A Todoist section."),
  }),
  defineProviderAction(service, {
    name: "get_section",
    description: "Get one Todoist section by ID.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: sectionLookup,
    outputSchema: s.object({ section: rawObject }),
  }),
  defineProviderAction(service, {
    name: "create_section",
    description: "Create a Todoist section.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: createSectionInput,
    outputSchema: s.object({ section: rawObject }),
  }),
  defineProviderAction(service, {
    name: "update_section",
    description: "Update a Todoist section.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: updateSectionInput,
    outputSchema: s.object({ section: rawObject }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Todoist tasks using the API v1 filters.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: listTasksInput,
    outputSchema: paginated("tasks", "A Todoist task."),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get one Todoist task by ID.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: taskLookup,
    outputSchema: s.object({ task: rawObject }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a Todoist task.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: createTaskInput,
    outputSchema: s.object({ task: rawObject }),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a Todoist task.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: updateTaskInput,
    outputSchema: s.object({ task: rawObject }),
  }),
  defineProviderAction(service, {
    name: "close_task",
    description: "Close a Todoist task.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: taskLookup,
    outputSchema: s.object({ success: s.literal(true) }),
  }),
  defineProviderAction(service, {
    name: "list_comments",
    description: "List Todoist comments by task or project.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: listCommentsInput,
    outputSchema: paginated("comments", "A Todoist comment."),
  }),
  defineProviderAction(service, {
    name: "get_comment",
    description: "Get one Todoist comment by ID.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: commentLookup,
    outputSchema: s.object({ comment: rawObject }),
  }),
  defineProviderAction(service, {
    name: "create_comment",
    description: "Create a Todoist comment on a task or project.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: createCommentInput,
    outputSchema: s.object({ comment: rawObject }),
  }),
  defineProviderAction(service, {
    name: "update_comment",
    description: "Update a Todoist comment.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: updateCommentInput,
    outputSchema: s.object({ comment: rawObject }),
  }),
  defineProviderAction(service, {
    name: "list_labels",
    description: "List Todoist labels visible to the connected account.",
    requiredScopes: todoistOAuthScopes,
    inputSchema: listLabelsInput,
    outputSchema: paginated("labels", "A Todoist label."),
  }),
];
