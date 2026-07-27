import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  customFieldSettingSchema,
  gidField,
  includeFieldsSchema,
  jobSchema,
  nextCursorSchema,
  paginationFields,
  projectSchema,
  sectionSchema,
  successOutputSchema,
} from "./schemas.ts";

const service = "asana";

const projectColors = [
  "dark-pink",
  "dark-green",
  "dark-blue",
  "dark-red",
  "dark-teal",
  "dark-brown",
  "dark-orange",
  "dark-purple",
  "dark-warm-gray",
  "light-pink",
  "light-green",
  "light-blue",
  "light-red",
  "light-teal",
  "light-brown",
  "light-orange",
  "light-purple",
  "light-warm-gray",
  "none",
];

const projectIcons = [
  "list",
  "board",
  "timeline",
  "calendar",
  "rocket",
  "people",
  "graph",
  "star",
  "bug",
  "light_bulb",
  "globe",
  "gear",
  "notebook",
  "computer",
  "check",
  "target",
  "html",
  "megaphone",
  "chat_bubbles",
  "briefcase",
  "page_layout",
  "mountain_flag",
  "puzzle",
  "presentation",
  "line_and_symbols",
  "speed_dial",
  "ribbon",
  "shoe",
  "shopping_basket",
  "map",
  "ticket",
  "coins",
];

const projectAccessLevels = ["admin", "editor", "commenter", "viewer"];
const projectMinimumAccessLevels = ["admin", "editor"];
const projectDuplicateIncludes = [
  "allocations",
  "forms",
  "members",
  "notes",
  "permissions",
  "task_assignee",
  "task_attachments",
  "task_dates",
  "task_dependencies",
  "task_followers",
  "task_notes",
  "task_projects",
  "task_subtasks",
  "task_tags",
  "task_templates",
  "task_type_default",
];

const customFieldsSchema = s.record(
  "Custom field values keyed by Asana custom field gid.",
  s.unknown("An Asana custom field value."),
);

const nullableGidSchema = (description: string): JsonSchema => s.nullable(gidField(description));
const nullableDateSchema = (description: string): JsonSchema => s.nullable(s.date(description));

const projectMutationFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The project name."),
  archived: s.boolean("Whether the project is archived."),
  color: s.nullable(s.stringEnum("The project color.", projectColors)),
  icon: s.nullable(s.stringEnum("The project icon.", projectIcons)),
  notes: s.string("Plain-text project notes. Cannot be combined with htmlNotes."),
  htmlNotes: s.string("HTML project notes. Cannot be combined with notes."),
  dueOn: nullableDateSchema("The project due date in YYYY-MM-DD format, or null to clear it."),
  startOn: nullableDateSchema("The project start date in YYYY-MM-DD format, or null to clear it."),
  defaultView: s.stringEnum("The project's default view.", ["list", "board", "calendar", "timeline"]),
  privacySetting: s.stringEnum("The project's privacy setting.", ["public_to_workspace", "private_to_team", "private"]),
  defaultAccessLevel: s.stringEnum("The default access level for new project members.", projectAccessLevels),
  minimumAccessLevelForCustomization: s.stringEnum(
    "The minimum access level needed to customize the project's workflow and appearance.",
    projectMinimumAccessLevels,
  ),
  minimumAccessLevelForSharing: s.stringEnum(
    "The minimum access level needed to share the project and manage memberships.",
    projectMinimumAccessLevels,
  ),
  customFields: customFieldsSchema,
  owner: nullableGidSchema('The project owner gid, email, "me", or null to clear the owner.'),
};

const projectCreateOnlyFields: Record<string, JsonSchema> = {
  followers: s.stringArray("Users who should follow the new project.", {
    minItems: 1,
    itemDescription: 'A user gid, email address, or the special identifier "me".',
  }),
};

const searchCustomFieldFilterSchema = s.object(
  "A filter for one project custom field.",
  {
    customFieldId: gidField("The custom field gid."),
    isSet: s.boolean("Whether the custom field must have a value."),
    value: s.anyOf("An exact text, number, or enum option gid value.", [
      s.string("An exact text or enum option gid."),
      s.number("An exact numeric value."),
    ]),
    startsWith: s.string("A text prefix to match."),
    endsWith: s.string("A text suffix to match."),
    contains: s.string("A text fragment to match."),
    lessThan: s.number("An exclusive numeric upper bound."),
    greaterThan: s.number("An exclusive numeric lower bound."),
  },
  { required: ["customFieldId"] },
);
searchCustomFieldFilterSchema.anyOf = [
  "isSet",
  "value",
  "startsWith",
  "endsWith",
  "contains",
  "lessThan",
  "greaterThan",
].map((field) => ({ required: [field] }));

const projectsOutputSchema = s.object("The output payload for this action.", {
  projects: s.array("The Asana projects.", projectSchema),
  nextCursor: nextCursorSchema,
});

const searchProjectsOutputSchema = s.object("The output payload for this action.", {
  projects: s.array("The matching Asana projects.", projectSchema),
});

const projectOutputSchema = s.object("The output payload for this action.", {
  project: projectSchema,
});

const sectionOutputSchema = s.object("The output payload for this action.", {
  section: sectionSchema,
});

const sectionsOutputSchema = s.object("The output payload for this action.", {
  sections: s.array("The project sections.", sectionSchema),
  nextCursor: nextCursorSchema,
});

const taskCountsSchema = s.object("Documented task and milestone counts for a project.", {
  num_tasks: s.nonNegativeInteger("The number of tasks in the project."),
  num_incomplete_tasks: s.nonNegativeInteger("The number of incomplete tasks in the project."),
  num_completed_tasks: s.nonNegativeInteger("The number of completed tasks in the project."),
  num_milestones: s.nonNegativeInteger("The number of milestones in the project."),
  num_incomplete_milestones: s.nonNegativeInteger("The number of incomplete milestones in the project."),
  num_completed_milestones: s.nonNegativeInteger("The number of completed milestones in the project."),
});

function rejectPlainAndHtmlNotes(schema: JsonSchema): JsonSchema {
  schema.allOf = [{ not: { required: ["notes", "htmlNotes"] } }];
  return schema;
}

function projectCreateInputSchema(locationFields: Record<string, JsonSchema>, required: string[]): JsonSchema {
  return rejectPlainAndHtmlNotes(
    s.object(
      "The input payload for this action.",
      {
        ...locationFields,
        ...projectMutationFields,
        ...projectCreateOnlyFields,
        includeFields: includeFieldsSchema,
      },
      { required: [...required, "name"] },
    ),
  );
}

const genericProjectCreateInputSchema = projectCreateInputSchema(
  {
    workspaceId: gidField("The workspace or organization that will own the project."),
    teamId: gidField("The team that will own the project."),
  },
  [],
);
genericProjectCreateInputSchema.oneOf = [
  { required: ["workspaceId"], not: { required: ["teamId"] } },
  { required: ["teamId"], not: { required: ["workspaceId"] } },
];

const projectUpdateInputSchema = rejectPlainAndHtmlNotes(
  s.object(
    "The input payload for this action.",
    {
      projectId: gidField("The Asana project gid."),
      ...projectMutationFields,
      includeFields: includeFieldsSchema,
    },
    { required: ["projectId"] },
  ),
);
projectUpdateInputSchema.anyOf = Object.keys(projectMutationFields).map((field) => ({ required: [field] }));

function placementFields(noun: string): Record<string, JsonSchema> {
  return {
    insertBefore: gidField(`The existing ${noun} before which to insert the resource.`),
    insertAfter: gidField(`The existing ${noun} after which to insert the resource.`),
  };
}

function addMutuallyExclusivePlacement(schema: JsonSchema): JsonSchema {
  schema.allOf = [{ not: { required: ["insertBefore", "insertAfter"] } }];
  return schema;
}

function memberMutationInputSchema(field: "members" | "followers"): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      projectId: gidField("The Asana project gid."),
      [field]: s.stringArray(
        `The users to ${field === "members" ? "add or remove as members" : "add or remove as followers"}.`,
        {
          minItems: 1,
          itemDescription: 'A user gid, email address, or the special identifier "me".',
        },
      ),
      includeFields: includeFieldsSchema,
    },
    { required: ["projectId", field] },
  );
}

export const asanaProjectSectionActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List projects filtered by exactly one workspace or team.",
    requiredScopes: ["projects:read"],
    inputSchema: (() => {
      const schema = s.object(
        "The input payload for this action.",
        {
          workspaceId: gidField("The workspace or organization gid to filter projects on."),
          teamId: gidField("The team gid to filter projects on."),
          archived: s.boolean("Only return projects with this archived state."),
          ...paginationFields,
          includeFields: includeFieldsSchema,
        },
        { optional: ["workspaceId", "teamId", "archived", "limit", "cursor", "includeFields"] },
      );
      schema.oneOf = [
        { required: ["workspaceId"], not: { required: ["teamId"] } },
        { required: ["teamId"], not: { required: ["workspaceId"] } },
      ];
      return schema;
    })(),
    outputSchema: projectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a project at exactly one workspace or team location.",
    requiredScopes: ["projects:write"],
    inputSchema: genericProjectCreateInputSchema,
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get an Asana project by gid.",
    requiredScopes: ["projects:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        projectId: gidField("The Asana project gid."),
        includeFields: includeFieldsSchema,
      },
      { required: ["projectId"] },
    ),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update one or more writable fields on an Asana project.",
    requiredScopes: ["projects:write"],
    inputSchema: projectUpdateInputSchema,
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete an Asana project.",
    requiredScopes: ["projects:delete"],
    inputSchema: s.object(
      "The input payload for this action.",
      { projectId: gidField("The Asana project gid.") },
      { required: ["projectId"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "duplicate_project",
    description: "Start an asynchronous job to duplicate an Asana project.",
    requiredScopes: ["projects:write"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        projectId: gidField("The source project gid."),
        name: s.nonEmptyString("The name of the duplicated project."),
        include: s.array(
          "Optional project elements to copy.",
          s.stringEnum("A supported optional project element.", projectDuplicateIncludes),
          { minItems: 1 },
        ),
        scheduleDates: (() => {
          const schema = s.object(
            "Options for shifting copied task dates.",
            {
              shouldSkipWeekends: s.boolean("Whether shifted dates should skip weekends."),
              startOn: s.date("The first shifted start date."),
              dueOn: s.date("The final shifted due date."),
            },
            { required: ["shouldSkipWeekends"] },
          );
          schema.oneOf = [
            { required: ["startOn"], not: { required: ["dueOn"] } },
            { required: ["dueOn"], not: { required: ["startOn"] } },
          ];
          return schema;
        })(),
        includeFields: includeFieldsSchema,
      },
      { required: ["projectId", "name"] },
    ),
    outputSchema: s.object("The output payload for this action.", { job: jobSchema }),
  }),
  defineProviderAction(service, {
    name: "list_task_projects",
    description: "List projects associated with a task.",
    requiredScopes: ["projects:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        taskId: gidField("The Asana task gid."),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["taskId"] },
    ),
    outputSchema: projectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_team_projects",
    description: "List projects shared with a team.",
    requiredScopes: ["projects:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        teamId: gidField("The Asana team gid."),
        archived: s.boolean("Only return projects with this archived state."),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["teamId"] },
    ),
    outputSchema: projectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_team_project",
    description: "Create a project in an Asana team.",
    requiredScopes: ["projects:write"],
    inputSchema: projectCreateInputSchema({ teamId: gidField("The team that will own the project.") }, ["teamId"]),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_workspace_projects",
    description: "List projects in an Asana workspace or organization.",
    requiredScopes: ["projects:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        archived: s.boolean("Only return projects with this archived state."),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["workspaceId"] },
    ),
    outputSchema: projectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_workspace_project",
    description: "Create a project in an Asana workspace or organization.",
    requiredScopes: ["projects:write"],
    inputSchema: projectCreateInputSchema(
      { workspaceId: gidField("The workspace or organization that will own the project.") },
      ["workspaceId"],
    ),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_workspace_projects",
    description:
      "Search projects in a workspace using Asana's documented project filters. Asana does not paginate search results; use limit to cap the page size.",
    requiredScopes: ["projects:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        text: s.string("Full-text search over project names."),
        sortBy: s.stringEnum("The field used to sort matching projects.", [
          "due_date",
          "created_at",
          "completed_at",
          "modified_at",
          "relevance",
        ]),
        sortAscending: s.boolean("Whether to sort results in ascending order."),
        completed: s.boolean("Filter on project completion status."),
        limit: paginationFields.limit,
        teamIds: s.stringArray("Team gids to match.", { minItems: 1 }),
        ownerIds: s.stringArray("Owner gids to match.", { minItems: 1 }),
        memberIds: s.stringArray("Member gids to match.", { minItems: 1 }),
        excludedMemberIds: s.stringArray("Member gids to exclude.", { minItems: 1 }),
        portfolioIds: s.stringArray("Portfolio gids to match.", { minItems: 1 }),
        completedOn: s.nullable(s.date("Match projects completed on this date, or null for no date.")),
        completedOnBefore: s.date("Match projects completed before this date."),
        completedOnAfter: s.date("Match projects completed after this date."),
        completedAtBefore: s.dateTime("Match projects completed before this timestamp."),
        completedAtAfter: s.dateTime("Match projects completed after this timestamp."),
        createdOn: s.nullable(s.date("Match projects created on this date, or null for no date.")),
        createdOnBefore: s.date("Match projects created before this date."),
        createdOnAfter: s.date("Match projects created after this date."),
        createdAtBefore: s.dateTime("Match projects created before this timestamp."),
        createdAtAfter: s.dateTime("Match projects created after this timestamp."),
        dueOn: s.nullable(s.date("Match projects due on this date, or null for no date.")),
        dueOnBefore: s.date("Match projects due before this date."),
        dueOnAfter: s.date("Match projects due after this date."),
        dueAtBefore: s.dateTime("Match projects due before this timestamp."),
        dueAtAfter: s.dateTime("Match projects due after this timestamp."),
        startOn: s.nullable(s.date("Match projects starting on this date, or null for no date.")),
        startOnBefore: s.date("Match projects starting before this date."),
        startOnAfter: s.date("Match projects starting after this date."),
        customFieldFilters: s.array("Project custom field filters.", searchCustomFieldFilterSchema, {
          minItems: 1,
        }),
        includeFields: includeFieldsSchema,
      },
      { required: ["workspaceId"] },
    ),
    outputSchema: searchProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_project_custom_field",
    description: "Add a custom field setting to an Asana project.",
    requiredScopes: ["projects:write"],
    inputSchema: addMutuallyExclusivePlacement(
      s.object(
        "The input payload for this action.",
        {
          projectId: gidField("The Asana project gid."),
          customFieldId: gidField("The custom field gid to add."),
          isImportant: s.boolean("Whether the custom field is important in this project."),
          ...placementFields("custom field setting"),
          includeFields: includeFieldsSchema,
        },
        { required: ["projectId", "customFieldId"] },
      ),
    ),
    outputSchema: s.object("The output payload for this action.", {
      customFieldSetting: customFieldSettingSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "remove_project_custom_field",
    description: "Remove a custom field setting from an Asana project.",
    requiredScopes: ["projects:write"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        projectId: gidField("The Asana project gid."),
        customFieldId: gidField("The custom field gid to remove."),
      },
      { required: ["projectId", "customFieldId"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project_task_counts",
    description: "Get all documented task and milestone counts for an Asana project.",
    requiredScopes: ["projects:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        projectId: gidField("The Asana project gid."),
        includeFields: includeFieldsSchema,
      },
      { required: ["projectId"] },
    ),
    outputSchema: s.object("The output payload for this action.", { taskCounts: taskCountsSchema }),
  }),
  defineProviderAction(service, {
    name: "add_project_members",
    description: "Add users as members of an Asana project.",
    requiredScopes: [],
    inputSchema: memberMutationInputSchema("members"),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_project_members",
    description: "Remove users from an Asana project.",
    requiredScopes: [],
    inputSchema: memberMutationInputSchema("members"),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_project_followers",
    description: "Add users as followers of an Asana project.",
    requiredScopes: [],
    inputSchema: memberMutationInputSchema("followers"),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_project_followers",
    description: "Remove users from an Asana project's followers.",
    requiredScopes: [],
    inputSchema: memberMutationInputSchema("followers"),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_section",
    description: "Get an Asana project section by gid.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        sectionId: gidField("The Asana section gid."),
        includeFields: includeFieldsSchema,
      },
      { required: ["sectionId"] },
    ),
    outputSchema: sectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_section",
    description: "Rename an Asana project section.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        sectionId: gidField("The Asana section gid."),
        name: s.nonEmptyString("The new section name."),
        includeFields: includeFieldsSchema,
      },
      { required: ["sectionId", "name"] },
    ),
    outputSchema: sectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_section",
    description: "Delete an empty Asana project section.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      { sectionId: gidField("The Asana section gid.") },
      { required: ["sectionId"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_project_sections",
    description: "List sections in an Asana project.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        projectId: gidField("The Asana project gid."),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["projectId"] },
    ),
    outputSchema: sectionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_project_section",
    description: "Create a section in an Asana project, optionally at a specific position.",
    requiredScopes: [],
    inputSchema: addMutuallyExclusivePlacement(
      s.object(
        "The input payload for this action.",
        {
          projectId: gidField("The Asana project gid."),
          name: s.nonEmptyString("The section name."),
          ...placementFields("section"),
          includeFields: includeFieldsSchema,
        },
        { required: ["projectId", "name"] },
      ),
    ),
    outputSchema: sectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_section_task",
    description: "Move a task into a section, optionally at a specific position.",
    requiredScopes: ["tasks:write"],
    inputSchema: addMutuallyExclusivePlacement(
      s.object(
        "The input payload for this action.",
        {
          sectionId: gidField("The destination section gid."),
          taskId: gidField("The task gid to add."),
          ...placementFields("task"),
        },
        { required: ["sectionId", "taskId"] },
      ),
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "insert_project_section",
    description: "Move a section before or after another section in the same project.",
    requiredScopes: [],
    inputSchema: (() => {
      const schema = s.object(
        "The input payload for this action.",
        {
          projectId: gidField("The Asana project gid."),
          sectionId: gidField("The section gid to move."),
          beforeSectionId: gidField("The section before which to move this section."),
          afterSectionId: gidField("The section after which to move this section."),
        },
        { required: ["projectId", "sectionId"] },
      );
      schema.oneOf = [
        { required: ["beforeSectionId"], not: { required: ["afterSectionId"] } },
        { required: ["afterSectionId"], not: { required: ["beforeSectionId"] } },
      ];
      return schema;
    })(),
    outputSchema: successOutputSchema,
  }),
];
