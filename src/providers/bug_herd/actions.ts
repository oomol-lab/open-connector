import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bug_herd";

const positiveIntegerSchema = (description: string) => s.positiveInteger(description);
const pageSchema = s.positiveInteger("The one-based page number to request from BugHerd.");
const prioritySchema = s.stringEnum("The BugHerd task priority.", [
  "not set",
  "critical",
  "important",
  "normal",
  "minor",
]);
const tagNamesSchema = s.array(
  "The tag names to assign to the BugHerd task.",
  s.nonEmptyString("A single BugHerd task tag name."),
  { minItems: 1 },
);
const metaSchema = s.looseObject("The pagination metadata returned by BugHerd.", {
  count: s.integer("The total number of records reported by BugHerd when present."),
});
const organizationSchema = s.looseObject("A BugHerd organization object.", {
  id: s.integer("The BugHerd organization identifier."),
  name: s.string("The BugHerd organization name."),
});
const projectSchema = s.looseObject("A BugHerd project object.", {
  id: s.integer("The BugHerd project identifier."),
  name: s.string("The BugHerd project name."),
  devurl: s.string("The primary website URL configured for the project."),
  is_active: s.boolean("Whether the project is active."),
});
const taskSchema = s.looseObject("A BugHerd task object.", {
  id: s.integer("The globally unique BugHerd task identifier."),
  local_task_id: s.integer("The project-scoped BugHerd task number."),
  project_id: s.integer("The BugHerd project identifier for the task."),
  description: s.string("The BugHerd task description."),
  status: s.string("The current BugHerd task status or custom column name."),
  priority: prioritySchema,
});
const commentSchema = s.looseObject("A BugHerd task comment object.", {
  id: s.integer("The BugHerd comment identifier."),
  text: s.string("The comment text."),
  user_id: s.integer("The BugHerd user identifier for the commenter."),
  is_private: s.boolean("Whether the comment is private to team members."),
});
const attachmentSchema = s.looseObject("A BugHerd task attachment object.", {
  id: s.integer("The BugHerd attachment identifier."),
  file_name: s.string("The attachment file name."),
  url: s.url("The URL for the stored BugHerd attachment."),
});

const projectIdField = positiveIntegerSchema("The BugHerd project identifier.");
const taskIdField = positiveIntegerSchema("The globally unique BugHerd task identifier.");

const projectFields = {
  name: s.nonEmptyString("The BugHerd project name."),
  devurl: s.url("The primary website URL for the BugHerd project."),
  is_active: s.boolean("Whether the BugHerd project is active."),
  is_public: s.boolean("Whether public feedback is enabled for the BugHerd project."),
  guests_see_guests: s.boolean("Whether project guests can see other guests' feedback."),
};

const taskMutableFields = {
  description: s.nonEmptyString("The BugHerd task description."),
  priority: prioritySchema,
  status: s.nonEmptyString("The BugHerd status or custom column name for the task."),
  requester_id: positiveIntegerSchema("The BugHerd user identifier for the requester."),
  requester_email: s.email("The requester email address."),
  assigned_to_id: s.nullable(positiveIntegerSchema("The BugHerd user identifier to assign to the task.")),
  assigned_to_email: s.email("The email address of a project member to assign to the task."),
  unassign_user: positiveIntegerSchema("The BugHerd user identifier to remove from assignees."),
  tag_names: tagNamesSchema,
  external_id: s.nonEmptyString("An external identifier used to correlate the task."),
  site: s.url("The website URL where the task was reported."),
  url: s.nonEmptyString("The page path where the task was reported."),
  updater_email: s.email("The email address used to attribute this task update."),
};

const listProjectsInputSchema = s.actionInput(
  {
    page: pageSchema,
  },
  [],
  "The input payload for listing BugHerd projects.",
);
const listProjectsOutputSchema = s.actionOutput(
  {
    projects: s.array("The BugHerd projects returned for the requested page.", projectSchema),
    meta: metaSchema,
  },
  "The BugHerd project list response.",
);
const projectOutputSchema = s.actionOutput(
  {
    project: projectSchema,
  },
  "The BugHerd project response.",
);
const taskOutputSchema = s.actionOutput(
  {
    task: taskSchema,
  },
  "The BugHerd task response.",
);

export const bugHerdActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "show_organization",
    operationType: "read",
    description: "Retrieve top-level details about the authenticated BugHerd organization.",
    inputSchema: s.actionInput({}, [], "The input payload for retrieving the BugHerd organization."),
    outputSchema: s.actionOutput(
      {
        organization: organizationSchema,
      },
      "The BugHerd organization response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List all BugHerd projects in the organization.",
    inputSchema: listProjectsInputSchema,
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_active_projects",
    operationType: "read",
    description: "List active BugHerd projects in the organization.",
    inputSchema: listProjectsInputSchema,
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Retrieve full details for a BugHerd project.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
      },
      ["project_id"],
      "The input payload for retrieving a BugHerd project.",
    ),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_project",
    operationType: "write",
    description: "Create a BugHerd project with the required project name and website URL.",
    inputSchema: s.actionInput(projectFields, ["name", "devurl"], "The input payload for creating a BugHerd project."),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_project",
    operationType: "write",
    description: "Update settings for an existing BugHerd project.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        ...projectFields,
        has_custom_columns: s.boolean("Whether the BugHerd project uses custom columns."),
      },
      ["project_id"],
      "The input payload for updating a BugHerd project.",
    ),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_project_tasks",
    operationType: "read",
    description: "List BugHerd tasks for a project with optional server-side filters.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        updated_since: s.dateTime("Return tasks updated after this timestamp."),
        created_since: s.dateTime("Return tasks created after this timestamp."),
        status: s.nonEmptyString("Filter by BugHerd status name or custom column name."),
        priority: prioritySchema,
        tag: s.nonEmptyString("Filter by a BugHerd task tag name."),
        assigned_to_id: positiveIntegerSchema("Filter by assigned BugHerd user identifier."),
        external_id: s.nonEmptyString("Filter by external task identifier."),
        page: pageSchema,
      },
      ["project_id"],
      "The input payload for listing BugHerd project tasks.",
    ),
    outputSchema: s.actionOutput(
      {
        tasks: s.array("The BugHerd tasks returned for the requested page.", taskSchema),
        meta: metaSchema,
      },
      "The BugHerd task list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_task",
    operationType: "read",
    description: "Retrieve a BugHerd task by project ID and global task ID.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        task_id: taskIdField,
      },
      ["project_id", "task_id"],
      "The input payload for retrieving a BugHerd task.",
    ),
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_task",
    operationType: "write",
    description: "Create a BugHerd task in a project.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        ...taskMutableFields,
      },
      ["project_id", "description"],
      "The input payload for creating a BugHerd task.",
    ),
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_task",
    operationType: "write",
    description: "Update mutable fields on a BugHerd task.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        task_id: taskIdField,
        ...taskMutableFields,
      },
      ["project_id", "task_id"],
      "The input payload for updating a BugHerd task.",
    ),
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_comments",
    operationType: "read",
    description: "List comments on a BugHerd task.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        task_id: taskIdField,
      },
      ["project_id", "task_id"],
      "The input payload for listing BugHerd task comments.",
    ),
    outputSchema: s.actionOutput(
      {
        comments: s.array("The BugHerd comments returned for the task.", commentSchema),
        meta: metaSchema,
      },
      "The BugHerd comments list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_comment",
    operationType: "write",
    description: "Create a comment on a BugHerd task.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        task_id: taskIdField,
        text: s.nonEmptyString("The comment text."),
        user_id: positiveIntegerSchema("The BugHerd user identifier for the commenter."),
        email: s.email("The commenter email address. BugHerd looks up the user by email."),
        is_private: s.boolean("Whether this comment is private to team members."),
      },
      ["project_id", "task_id", "text"],
      "The input payload for creating a BugHerd task comment.",
    ),
    outputSchema: s.actionOutput(
      {
        comment: commentSchema,
      },
      "The BugHerd comment response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_attachments",
    operationType: "read",
    description: "List file attachments on a BugHerd task.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        task_id: taskIdField,
      },
      ["project_id", "task_id"],
      "The input payload for listing BugHerd task attachments.",
    ),
    outputSchema: s.actionOutput(
      {
        attachments: s.array("The BugHerd attachments returned for the task.", attachmentSchema),
        meta: metaSchema,
      },
      "The BugHerd attachments list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_attachment_from_url",
    operationType: "write",
    description: "Create a BugHerd task attachment from a publicly accessible file URL.",
    inputSchema: s.actionInput(
      {
        project_id: projectIdField,
        task_id: taskIdField,
        file_name: s.nonEmptyString("The file name to store with the attachment."),
        url: s.url("The publicly accessible URL that BugHerd should download and attach."),
      },
      ["project_id", "task_id", "file_name", "url"],
      "The input payload for creating a BugHerd attachment from a URL.",
    ),
    outputSchema: s.actionOutput(
      {
        attachment: attachmentSchema,
      },
      "The BugHerd attachment response.",
    ),
  }),
];
