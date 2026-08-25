import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "taiga";
const idSchema = s.integer("The numeric Taiga resource ID.", { minimum: 1 });
const nullableIdSchema = s.nullable(idSchema);
const tagsSchema = s.array("The Taiga tags assigned to the resource.", s.string("A tag name."));
const watchersSchema = s.array(
  "The numeric user IDs that should watch the resource.",
  s.integer("A Taiga user ID.", { minimum: 1 }),
);
const recordSchema = s.looseObject("A Taiga resource record returned by the instance.");
const paginationSchema = s.object("Pagination metadata returned by Taiga response headers.", {
  page: s.integer("The current page number."),
  pageSize: s.integer("The number of records requested per page."),
  pages: s.integer("The total number of pages."),
  count: s.integer("The total number of matching records."),
});
const listBaseProperties: Record<string, JsonSchema> = {
  page: s.integer("The one-based result page to request.", { minimum: 1 }),
  pageSize: s.integer("The number of records to request per page.", { minimum: 1, maximum: 1000 }),
};
const projectFields: Record<string, JsonSchema> = {
  name: s.string("The project name.", { minLength: 1 }),
  description: s.string("The project description."),
  creation_template: nullableIdSchema,
  is_backlog_activated: s.boolean("Whether the project backlog is enabled."),
  is_issues_activated: s.boolean("Whether issue tracking is enabled."),
  is_kanban_activated: s.boolean("Whether the Kanban module is enabled."),
  is_private: s.boolean("Whether the project is private."),
  is_wiki_activated: s.boolean("Whether the project wiki is enabled."),
};
const commonWorkItemFields: Record<string, JsonSchema> = {
  assigned_to: nullableIdSchema,
  blocked_note: s.string("The reason the item is blocked."),
  description: s.string("The item description."),
  is_blocked: s.boolean("Whether the item is blocked."),
  is_closed: s.boolean("Whether the item is closed."),
  milestone: nullableIdSchema,
  status: nullableIdSchema,
  subject: s.string("The item subject.", { minLength: 1 }),
  tags: tagsSchema,
  watchers: watchersSchema,
};

function listOutput(description: string): JsonSchema {
  return s.object(description, {
    items: s.array("The matching Taiga records.", recordSchema),
    pagination: paginationSchema,
  });
}

function getOutput(key: string, description: string): JsonSchema {
  return s.object(description, { [key]: recordSchema });
}

export const taigaActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Taiga projects visible to the connected user.",
    inputSchema: s.object(
      "Filters and pagination for Taiga projects.",
      {
        ...listBaseProperties,
        member: idSchema,
        is_looking_for_people: s.boolean("Whether to return projects looking for contributors."),
        is_featured: s.boolean("Whether to return projects featured by the instance staff."),
      },
      { optional: ["page", "pageSize", "member", "is_looking_for_people", "is_featured"] },
    ),
    outputSchema: listOutput("The visible Taiga projects and pagination metadata."),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get a Taiga project by numeric ID.",
    inputSchema: s.object("A Taiga project identifier.", { projectId: idSchema }),
    outputSchema: getOutput("project", "The requested Taiga project."),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Taiga project.",
    inputSchema: s.object("Fields for a new Taiga project.", projectFields, {
      optional: [
        "creation_template",
        "is_backlog_activated",
        "is_issues_activated",
        "is_kanban_activated",
        "is_private",
        "is_wiki_activated",
      ],
    }),
    outputSchema: getOutput("project", "The created Taiga project."),
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update a Taiga project using optimistic concurrency control.",
    inputSchema: s.object(
      "A Taiga project update.",
      { projectId: idSchema, version: s.integer("The current project version."), ...projectFields },
      {
        optional: [
          "name",
          "description",
          "creation_template",
          "is_backlog_activated",
          "is_issues_activated",
          "is_kanban_activated",
          "is_private",
          "is_wiki_activated",
        ],
      },
    ),
    outputSchema: getOutput("project", "The updated Taiga project."),
  }),
  defineProviderAction(service, {
    name: "list_user_stories",
    description: "List Taiga user stories with optional project filters.",
    inputSchema: s.object(
      "Filters and pagination for Taiga user stories.",
      {
        ...listBaseProperties,
        project: idSchema,
        status: idSchema,
        milestone: idSchema,
        assigned_to: idSchema,
        status__is_closed: s.boolean("Whether to return stories with closed statuses."),
      },
      {
        optional: ["page", "pageSize", "project", "status", "milestone", "assigned_to", "status__is_closed"],
      },
    ),
    outputSchema: listOutput("The matching Taiga user stories and pagination metadata."),
  }),
  defineProviderAction(service, {
    name: "get_user_story",
    description: "Get a Taiga user story by numeric ID.",
    inputSchema: s.object("A Taiga user story identifier.", { userStoryId: idSchema }),
    outputSchema: getOutput("userStory", "The requested Taiga user story."),
  }),
  defineProviderAction(service, {
    name: "create_user_story",
    description: "Create a Taiga user story.",
    inputSchema: s.object(
      "Fields for a new Taiga user story.",
      {
        project: idSchema,
        ...commonWorkItemFields,
        client_requirement: s.boolean("Whether the story is a client requirement."),
        team_requirement: s.boolean("Whether the story is a team requirement."),
      },
      {
        optional: [
          "assigned_to",
          "blocked_note",
          "description",
          "is_blocked",
          "is_closed",
          "milestone",
          "status",
          "tags",
          "watchers",
          "client_requirement",
          "team_requirement",
        ],
      },
    ),
    outputSchema: getOutput("userStory", "The created Taiga user story."),
  }),
  defineProviderAction(service, {
    name: "update_user_story",
    description: "Update a Taiga user story using optimistic concurrency control.",
    inputSchema: s.object(
      "A Taiga user story update.",
      {
        userStoryId: idSchema,
        version: s.integer("The current user story version."),
        ...commonWorkItemFields,
        client_requirement: s.boolean("Whether the story is a client requirement."),
        team_requirement: s.boolean("Whether the story is a team requirement."),
      },
      {
        optional: [
          "assigned_to",
          "blocked_note",
          "description",
          "is_blocked",
          "is_closed",
          "milestone",
          "status",
          "subject",
          "tags",
          "watchers",
          "client_requirement",
          "team_requirement",
        ],
      },
    ),
    outputSchema: getOutput("userStory", "The updated Taiga user story."),
  }),
  ...createWorkItemActions("task", "tasks", {
    user_story: nullableIdSchema,
  }),
  ...createWorkItemActions("issue", "issues", {
    severity: nullableIdSchema,
    priority: nullableIdSchema,
    type: nullableIdSchema,
  }),
];

function createWorkItemActions(
  singular: "task" | "issue",
  plural: "tasks" | "issues",
  extraFields: Record<string, JsonSchema>,
): ActionDefinition[] {
  const idKey = singular == "task" ? "taskId" : "issueId";
  const listFilters = {
    ...listBaseProperties,
    project: idSchema,
    status: idSchema,
    milestone: idSchema,
    assigned_to: idSchema,
    status__is_closed: s.boolean(`Whether to return ${plural} with closed statuses.`),
  };
  return [
    defineProviderAction(service, {
      name: `list_${plural}`,
      description: `List Taiga ${plural} with optional project filters.`,
      inputSchema: s.object(`Filters and pagination for Taiga ${plural}.`, listFilters, {
        optional: ["page", "pageSize", "project", "status", "milestone", "assigned_to", "status__is_closed"],
      }),
      outputSchema: listOutput(`The matching Taiga ${plural} and pagination metadata.`),
    }),
    defineProviderAction(service, {
      name: `get_${singular}`,
      description: `Get a Taiga ${singular} by numeric ID.`,
      inputSchema: s.object(`A Taiga ${singular} identifier.`, { [idKey]: idSchema }),
      outputSchema: getOutput(singular, `The requested Taiga ${singular}.`),
    }),
    defineProviderAction(service, {
      name: `create_${singular}`,
      description: `Create a Taiga ${singular}.`,
      inputSchema: s.object(
        `Fields for a new Taiga ${singular}.`,
        { project: idSchema, ...commonWorkItemFields, ...extraFields },
        {
          optional: [
            "assigned_to",
            "blocked_note",
            "description",
            "is_blocked",
            "is_closed",
            "milestone",
            "status",
            "tags",
            "watchers",
            ...Object.keys(extraFields),
          ],
        },
      ),
      outputSchema: getOutput(singular, `The created Taiga ${singular}.`),
    }),
    defineProviderAction(service, {
      name: `update_${singular}`,
      description: `Update a Taiga ${singular} using optimistic concurrency control.`,
      inputSchema: s.object(
        `A Taiga ${singular} update.`,
        {
          [idKey]: idSchema,
          version: s.integer(`The current ${singular} version.`),
          ...commonWorkItemFields,
          ...extraFields,
        },
        {
          optional: [
            "assigned_to",
            "blocked_note",
            "description",
            "is_blocked",
            "is_closed",
            "milestone",
            "status",
            "subject",
            "tags",
            "watchers",
            ...Object.keys(extraFields),
          ],
        },
      ),
      outputSchema: getOutput(singular, `The updated Taiga ${singular}.`),
    }),
  ];
}
