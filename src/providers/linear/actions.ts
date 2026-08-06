import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { linearCommentsCreateScope, linearIssuesCreateScope, linearReadScope, linearWriteScope } from "./scopes.ts";

const service = "linear";

interface LinearActionSource {
  name: LinearActionName;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const objectSchema = s.record(true, { description: "Linear API object." });
const stringId = s.string({ minLength: 1, description: "Linear resource ID." });
const cursor = s.string({ description: "Pagination cursor." });
const first = s.integer({ minimum: 1, description: "Number of records to return." });
const pageInfo = s.object(
  {
    startCursor: s.nullable(s.string({ description: "Previous-page start cursor." })),
    endCursor: s.nullable(s.string({ description: "Next-page end cursor." })),
    hasPreviousPage: s.boolean({ description: "Whether a previous page exists." }),
    hasNextPage: s.boolean({ description: "Whether a next page exists." }),
    end_cursor: s.nullable(s.string({ description: "Next-page end cursor." })),
    has_next_page: s.boolean({ description: "Whether a next page exists." }),
  },
  { additionalProperties: true, description: "Pagination information." },
);
const rawGraphqlResult = s.object(
  {
    data: s.nullable(objectSchema),
    errors: s.array(objectSchema, { description: "GraphQL errors." }),
    extensions: objectSchema,
    message: s.string({ description: "Summarized execution status." }),
  },
  { additionalProperties: true, description: "Raw GraphQL response." },
);

const actions: LinearActionSource[] = [
  action(
    "create_attachment",
    "Create or update an attachment for the specified Linear issue.",
    [linearIssuesCreateScope],
    input(
      {
        issue_id: stringId,
        title: s.string({ minLength: 1, description: "Attachment title." }),
        url: s.string({ minLength: 1, description: "Attachment URL." }),
        subtitle: s.string({ description: "Attachment subtitle." }),
      },
      ["issue_id", "title", "url"],
    ),
    object({
      id: stringId,
      issue_id: stringId,
      title: s.string({ description: "Attachment title." }),
      url: s.string({ description: "Attachment URL." }),
      subtitle: s.nullable(s.string({ description: "Attachment subtitle." })),
    }),
  ),
  action(
    "create_comment_reaction",
    "Creates an emoji reaction for the specified Linear comment.",
    [linearWriteScope],
    input(
      {
        comment_id: stringId,
        emoji: s.string({ minLength: 1, description: "Emoji to add." }),
      },
      ["comment_id", "emoji"],
    ),
    object({ reaction_id: stringId, comment_id: stringId, emoji: s.string() }),
  ),
  action(
    "create_linear_comment",
    "Creates a comment for the specified Linear issue.",
    [linearCommentsCreateScope],
    input(
      {
        issueId: stringId,
        body: s.string({ minLength: 1, description: "Comment text in Markdown." }),
      },
      ["issueId", "body"],
    ),
    object({ comment_id: stringId, issue_id: stringId, body: s.string() }),
  ),
  action(
    "create_linear_issue",
    "Create a new Linear issue in the specified team and support fields such as project, person in charge, status, label, etc.",
    [linearIssuesCreateScope],
    input(issueCreateFields(), ["title", "team_id"]),
    object({
      id: stringId,
      identifier: s.string({ description: "Issue identifier." }),
      issue_title: s.string({ description: "Issue title." }),
      issue_description: s.nullable(s.string({ description: "Issue description." })),
      ticket_url: s.string({ description: "Issue URL." }),
    }),
  ),
  action(
    "create_linear_issue_relation",
    "Create a relationship between two Linear issues, such as blocks, related, or duplicate.",
    [linearWriteScope],
    input(
      {
        issue_id: stringId,
        related_issue_id: stringId,
        relation_type: s.stringEnum(["blocks", "duplicate", "related", "similar"], {
          description: "Relationship type.",
        }),
      },
      ["issue_id", "related_issue_id", "relation_type"],
    ),
    object({ id: stringId, issue_id: stringId, related_issue_id: stringId, relation_type: s.string() }),
  ),
  action(
    "create_linear_label",
    "Creates a new Linear issue label in the specified team.",
    [linearWriteScope],
    input(
      {
        team_id: stringId,
        name: s.string({ minLength: 1, description: "Label name." }),
        color: s.string({ minLength: 1, description: "Label color." }),
        description: s.string({ description: "Label description." }),
      },
      ["team_id", "name", "color"],
    ),
    object({
      id: stringId,
      team_id: stringId,
      name: s.string(),
      color: s.string(),
      description: s.nullable(s.string()),
    }),
  ),
  action(
    "create_linear_project",
    "Create a new Linear project and associate one or more teams.",
    [linearWriteScope],
    input(projectCreateFields(), ["name", "team_ids"]),
    object({ id: stringId, name: s.string(), url: s.string(), state: s.string() }),
  ),
  action(
    "create_project_milestone",
    "Creates a project milestone for the specified Linear project.",
    [linearWriteScope],
    input(
      {
        name: s.string({ minLength: 1, description: "Milestone name." }),
        project_id: stringId,
        sort_order: s.number({ description: "Milestone sort order." }),
        description: s.string({ description: "Milestone description." }),
        target_date: s.string({ description: "Target date." }),
      },
      ["name", "project_id"],
    ),
    object({ id: stringId, project_id: stringId, name: s.string(), target_date: s.nullable(s.string()) }),
  ),
  action(
    "create_project_update",
    "Creates a project progress update for the specified Linear project.",
    [linearWriteScope],
    input(
      {
        body: s.string({ minLength: 1, description: "Project update body." }),
        health: s.stringEnum(["onTrack", "atRisk", "offTrack"], { description: "Project health." }),
        project_id: stringId,
        is_diff_hidden: s.boolean({ description: "Whether to hide diff." }),
      },
      ["body", "project_id"],
    ),
    object({
      id: stringId,
      project_id: stringId,
      body: s.nullable(s.string()),
      health: s.nullable(s.string()),
      is_diff_hidden: s.boolean(),
    }),
  ),
  action(
    "delete_linear_issue",
    "Delete the specified Linear issue.",
    [linearWriteScope],
    input({ issue_id: stringId }, ["issue_id"]),
    object({ id: stringId, deleted: s.boolean() }),
  ),
  action(
    "get_all_linear_teams",
    "Lists all Linear team basic information accessible with the current credentials.",
    [linearReadScope],
    input({}),
    listOutput("teams"),
  ),
  action(
    "get_attachment",
    "Retrieve a Linear attachment based on the issue and attachment ID or file name.",
    [linearReadScope],
    input(
      {
        issue_id: stringId,
        attachment_id: stringId,
        file_name: s.string({ minLength: 1, description: "Attachment file name or title." }),
      },
      ["issue_id"],
    ),
    object({ attachment: objectSchema }),
  ),
  action(
    "get_current_user",
    "Get the currently authenticated Linear user profile.",
    [linearReadScope],
    input({}),
    object({ viewer: objectSchema }),
  ),
  action(
    "get_cycles_by_team_id",
    "Get all cycle information under the specified team.",
    [linearReadScope],
    input({ team_id: stringId }, ["team_id"]),
    listOutput("cycles"),
  ),
  action(
    "get_issue_defaults",
    "Gets the default status and default estimate used when the specified team creates an issue.",
    [linearReadScope],
    input({ team_id: stringId }, ["team_id"]),
    object({ team: objectSchema }),
  ),
  action(
    "get_linear_issue",
    "Get details of a Linear issue, including comments, attachments, subscribers, and underlying relationship fields.",
    [linearReadScope],
    input({ issue_id: stringId }, ["issue_id"]),
    object({ issue: objectSchema }),
  ),
  action(
    "get_linear_project",
    "Get the details of a Linear project, complete with team, members, and initiatives on demand.",
    [linearReadScope],
    input(
      {
        project_id: stringId,
        include_teams: s.boolean({ description: "Include project teams." }),
        include_members: s.boolean({ description: "Include project members." }),
        include_initiatives: s.boolean({ description: "Include project initiatives." }),
      },
      ["project_id"],
    ),
    object({ project: objectSchema }),
  ),
  action(
    "list_issues_by_team_id",
    "List Linear issues by team, and support cursor paging and whether to include archived issues.",
    [linearReadScope],
    input(
      {
        after: cursor,
        first,
        team_id: stringId,
        include_archived: s.boolean({ description: "Include archived issues." }),
      },
      ["team_id"],
    ),
    object({ team: objectSchema, issues: s.array(objectSchema), page_info: pageInfo }),
  ),
  action(
    "list_issue_drafts",
    "Lists issue drafts visible to the current user in Linear.",
    [linearReadScope],
    pagedInput(),
    object({ drafts: s.array(objectSchema), page_info: pageInfo }),
  ),
  action(
    "list_linear_cycles",
    "Lists the Linear periods accessible by the current credential.",
    [linearReadScope],
    input({}),
    listOutput("cycles"),
  ),
  action(
    "list_linear_issues",
    "Lists Linear issues accessible with current credentials, and supports filtering by project and person in charge.",
    [linearReadScope],
    input({
      after: cursor,
      first,
      project_id: stringId,
      assignee_id: stringId,
    }),
    object({ issues: s.array(objectSchema), page_info: pageInfo }),
  ),
  action(
    "list_linear_labels",
    "Lists Linear labels for a specified team or entire workspace.",
    [linearReadScope],
    input({ team_id: stringId }),
    listOutput("labels"),
  ),
  action(
    "list_linear_projects",
    "Lists Linear projects accessible with the current credentials.",
    [linearReadScope],
    input({}),
    listOutput("projects"),
  ),
  action(
    "list_linear_states",
    "Lists all workflow statuses for the specified team.",
    [linearReadScope],
    input({ team_id: stringId }, ["team_id"]),
    listOutput("states"),
  ),
  action(
    "list_linear_teams",
    "Lists Linear teams accessible with current credentials, along with a list of members and projects.",
    [linearReadScope],
    input({ project_id: stringId }),
    listOutput("teams"),
  ),
  action(
    "list_linear_users",
    "List Linear users in the current workspace and support cursor paging.",
    [linearReadScope],
    pagedInput(),
    object({ users: s.array(objectSchema), page_info: pageInfo }),
  ),
  action(
    "remove_issue_label",
    "Removes a label from the specified Linear issue.",
    [linearWriteScope],
    input({ issue_id: stringId, label_id: stringId }, ["issue_id", "label_id"]),
    object({ issue_id: stringId, label_id: stringId, removed: s.boolean() }),
  ),
  action(
    "remove_reaction",
    "Delete an existing Linear reaction.",
    [linearWriteScope],
    input({ reaction_id: stringId }, ["reaction_id"]),
    object({ reaction_id: stringId, removed: s.boolean() }),
  ),
  action(
    "run_query",
    "Execute a read-only query directly against the Linear GraphQL API.",
    [linearReadScope],
    input({ query: s.string({ minLength: 1 }), variables: objectSchema }, ["query"]),
    rawGraphqlResult,
  ),
  action(
    "run_mutation",
    "Perform a mutation directly on the Linear GraphQL API.",
    [linearWriteScope],
    input({ mutation: s.string({ minLength: 1 }), variables: objectSchema }, ["mutation"]),
    rawGraphqlResult,
  ),
  action(
    "search_issues",
    "Retrieve issues through Linear's full-text search capabilities.",
    [linearReadScope],
    input(
      {
        query: s.string({ minLength: 1, description: "Search query." }),
        after: cursor,
        first,
        include_archived: s.boolean({ description: "Include archived issues." }),
      },
      ["query"],
    ),
    object({ issues: s.array(objectSchema), page_info: pageInfo, total_count: s.integer() }),
  ),
  action(
    "update_issue",
    "Update an existing Linear issue and support fields such as title, description, status, project, label, etc.",
    [linearWriteScope],
    input(issueUpdateFields(), ["issueId"]),
    object({ issue: objectSchema }),
  ),
  action(
    "update_linear_comment",
    "Update the text of an existing Linear comment.",
    [linearWriteScope],
    input({ comment_id: stringId, body: s.string({ minLength: 1 }) }, ["comment_id", "body"]),
    object({ comment: objectSchema }),
  ),
  action(
    "update_linear_project",
    "Update an existing Linear project.",
    [linearWriteScope],
    input({ project_id: stringId, ...projectUpdateFields() }, ["project_id"]),
    object({ project: objectSchema }),
  ),
];

export type LinearActionName =
  | "create_attachment"
  | "create_comment_reaction"
  | "create_linear_comment"
  | "create_linear_issue"
  | "create_linear_issue_relation"
  | "create_linear_label"
  | "create_linear_project"
  | "create_project_milestone"
  | "create_project_update"
  | "delete_linear_issue"
  | "get_all_linear_teams"
  | "get_attachment"
  | "get_current_user"
  | "get_cycles_by_team_id"
  | "get_issue_defaults"
  | "get_linear_issue"
  | "get_linear_project"
  | "list_issues_by_team_id"
  | "list_issue_drafts"
  | "list_linear_cycles"
  | "list_linear_issues"
  | "list_linear_labels"
  | "list_linear_projects"
  | "list_linear_states"
  | "list_linear_teams"
  | "list_linear_users"
  | "remove_issue_label"
  | "remove_reaction"
  | "run_query"
  | "run_mutation"
  | "search_issues"
  | "update_issue"
  | "update_linear_comment"
  | "update_linear_project";

export const linearActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    name: source.name,
    description: source.description,
    requiredScopes: source.requiredScopes,
    inputSchema: source.inputSchema,
    outputSchema: source.outputSchema,
  }),
);

function action(
  name: LinearActionName,
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): LinearActionSource {
  return { name, description, requiredScopes, inputSchema, outputSchema };
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "The input payload for this action.");
}

function object(properties: Record<string, JsonSchema>): JsonSchema {
  return s.object(properties, { additionalProperties: true, description: "Linear action output." });
}

function pagedInput(): JsonSchema {
  return input({ after: cursor, first });
}

function listOutput(key: string): JsonSchema {
  return object({ [key]: s.array(objectSchema, { description: `${key} returned by Linear.` }) });
}

function issueCreateFields(): Record<string, JsonSchema> {
  return {
    title: s.string({ minLength: 1, description: "Issue title." }),
    team_id: stringId,
    cycle_id: stringId,
    due_date: s.string({ description: "Issue due date." }),
    estimate: s.number({ description: "Issue estimate." }),
    priority: s.number({ description: "Issue priority." }),
    state_id: stringId,
    label_ids: s.array(stringId, { description: "Label IDs." }),
    parent_id: stringId,
    project_id: stringId,
    assignee_id: stringId,
    description: s.string({ description: "Issue description in Markdown." }),
  };
}

function issueUpdateFields(): Record<string, JsonSchema> {
  return {
    issueId: stringId,
    title: s.string({ description: "Issue title." }),
    teamId: stringId,
    cycleId: stringId,
    dueDate: s.string({ description: "Issue due date." }),
    stateId: stringId,
    estimate: s.number({ description: "Issue estimate." }),
    labelIds: s.array(stringId, { description: "Label IDs." }),
    parentId: stringId,
    priority: s.number({ description: "Issue priority." }),
    projectId: stringId,
    assigneeId: stringId,
    description: s.string({ description: "Issue description in Markdown." }),
  };
}

function projectCreateFields(): Record<string, JsonSchema> {
  return {
    ...projectUpdateFields(),
    team_ids: s.array(stringId, { minItems: 1, description: "Team IDs associated with the project." }),
  };
}

function projectUpdateFields(): Record<string, JsonSchema> {
  return {
    icon: s.string({ description: "Project icon." }),
    name: s.string({ minLength: 1, description: "Project name." }),
    color: s.string({ description: "Project color." }),
    lead_id: stringId,
    priority: s.number({ description: "Project priority." }),
    status_id: stringId,
    state: s.string({ description: "Project state type." }),
    start_date: s.string({ description: "Project start date." }),
    description: s.string({ description: "Project description." }),
    target_date: s.string({ description: "Project target date." }),
  };
}
