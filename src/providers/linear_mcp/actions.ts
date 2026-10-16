import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linear_mcp";
const readScope = ["read"];
const writeScope = ["write"];

/** The signed-in Linear user as the MCP get_user tool reports it. */
export interface LinearMcpUser {
  id: string;
  email?: string;
  displayName?: string;
  name?: string;
}

/**
 * Typed fields lifted from one Linear MCP issue record. Linear publishes no
 * output schema for its MCP tools, so every field but `id` is best effort and
 * the untouched text travels beside it as `raw`.
 */
export interface LinearMcpIssue {
  id: string;
  identifier?: string;
  uuid?: string;
  title?: string;
  description?: string;
  descriptionTruncated?: boolean;
  url?: string;
  state?: string;
  priority?: unknown;
  assignee?: string;
  assigneeId?: string;
  creator?: string;
  creatorId?: string;
  team?: string;
  project?: string;
  labels?: string[];
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string;
  completedAt?: string;
  dueDate?: string;
}

/** Typed fields lifted from one Linear MCP comment record. */
export interface LinearMcpComment {
  id: string;
  body?: string;
  user?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
}

/**
 * Typed fields lifted from one Linear MCP record that names a thing: a team, a
 * project, a workflow state or a label. The list tools answer records of
 * different shapes; only the id is required and the rest is best effort.
 */
export interface LinearMcpNamedRecord {
  id: string;
  name?: string;
  key?: string;
  type?: string;
  color?: string;
  url?: string;
  state?: string;
}

const rawSchema = s.string(
  "The untouched text Linear's MCP tool returned. Read it when a typed field is missing: Linear can change its MCP output shape without notice.",
);

const userSchema = s.looseObject("The signed-in Linear user.", {
  id: s.nonEmptyString("Linear user ID; the same viewer ID the Linear GraphQL API reports."),
  email: s.optional(s.string("The user's email address, when returned.")),
  displayName: s.optional(s.string("The user's display name, when returned.")),
  name: s.optional(s.string("The user's full name, when returned.")),
});

const issueSchema = s.looseObject(
  "A Linear issue. Typed fields are lifted from the MCP record when present; fields not listed here are only in the action's raw text.",
  {
    id: s.nonEmptyString(
      "Issue ID as Linear MCP returned it. This may be the human identifier such as ENG-123 rather than the UUID; see identifier and uuid.",
    ),
    identifier: s.optional(s.string("Human identifier such as ENG-123, when known.")),
    uuid: s.optional(s.string("Issue UUID, when known.")),
    title: s.optional(s.string("Issue title.")),
    description: s.optional(
      s.string("Issue description in Markdown. Linear MCP may clip it in lists; see descriptionTruncated."),
    ),
    descriptionTruncated: s.optional(
      s.boolean("Whether the description carries Linear's truncation marker. Call get_issue for the full text."),
    ),
    url: s.optional(s.string("Link to the issue in Linear.")),
    state: s.optional(s.string("Workflow state name.")),
    priority: s.optional(s.unknown("Priority as returned: a number or a label.")),
    assignee: s.optional(s.string("Assignee name, when assigned.")),
    assigneeId: s.optional(s.string("Assignee user ID, when the record carries one.")),
    creator: s.optional(s.string("Creator name, when returned.")),
    creatorId: s.optional(s.string("Creator user ID, when the record carries one.")),
    team: s.optional(s.string("Team name or key.")),
    project: s.optional(s.string("Project name, when the issue belongs to one.")),
    labels: s.optional(s.stringArray("Label names.")),
    createdAt: s.optional(s.string("Creation time as returned by Linear.")),
    updatedAt: s.optional(s.string("Last update time as returned by Linear.")),
    archivedAt: s.optional(s.string("Archive time, when archived.")),
    completedAt: s.optional(s.string("Completion time, when completed.")),
    dueDate: s.optional(s.string("Due date, when set.")),
  },
);

const commentSchema = s.looseObject("A Linear issue comment.", {
  id: s.nonEmptyString("Comment ID."),
  body: s.optional(s.string("Comment body in Markdown.")),
  user: s.optional(s.string("Author name, when returned.")),
  userId: s.optional(s.string("Author user ID, when the record carries one.")),
  createdAt: s.optional(s.string("Creation time as returned by Linear.")),
  updatedAt: s.optional(s.string("Last edit time, when returned.")),
  url: s.optional(s.string("Link to the comment in Linear.")),
});

const namedRecordSchema = s.looseObject(
  "A team, project, workflow state or label as Linear MCP lists it. Typed fields are lifted when present; the rest is only in the action's raw text.",
  {
    id: s.nonEmptyString("Record ID as Linear MCP returned it."),
    name: s.optional(s.string("Display name.")),
    key: s.optional(s.string("Team key such as ENG, when the record is a team.")),
    type: s.optional(s.string("Workflow state type such as started or completed, when the record is a state.")),
    color: s.optional(s.string("Color, when the record is a label.")),
    url: s.optional(s.string("Link to the record in Linear, when returned.")),
    state: s.optional(s.string("Project state, when the record is a project.")),
  },
);

const issueFields = {
  title: s.nonEmptyString("Issue title."),
  description: s.string("Issue description in Markdown."),
  team: s.nonEmptyString("Team key, name or ID the issue belongs to."),
  assignee: s.string("Assignee as a user ID, name or email, or me for the signed-in user."),
  state: s.string("Workflow state name or ID."),
  priority: s.integer("Priority as Linear numbers it: 0 none, 1 urgent, 2 high, 3 medium, 4 low.", {
    minimum: 0,
    maximum: 4,
  }),
  labels: s.stringArray("Label names or IDs."),
  project: s.string("Project name or ID."),
  dueDate: s.string("Due date as YYYY-MM-DD."),
  parentId: s.string("Parent issue ID or identifier, for a sub-issue."),
  estimate: s.integer("Estimate on the team's scale."),
};
const optionalIssueFields = [
  "description",
  "assignee",
  "state",
  "priority",
  "labels",
  "project",
  "dueDate",
  "parentId",
  "estimate",
];

const createIssueInputSchema = s.object(
  "Fields forwarded to Linear's MCP save_issue tool without an id, which creates the issue. Keys this schema does not name pass through as given and Linear's server validates them.",
  issueFields,
  { optional: optionalIssueFields, additionalProperties: true },
);

const updateIssueInputSchema = s.object(
  "Fields forwarded to Linear's MCP save_issue tool with an id, which updates the issue. Only the fields given change; keys this schema does not name pass through as given.",
  { id: s.nonEmptyString("Issue ID or human identifier such as ENG-123, as returned by list_issues."), ...issueFields },
  { optional: ["title", "team", ...optionalIssueFields], additionalProperties: true },
);

const createCommentInputSchema = s.object(
  "Fields forwarded to Linear's MCP save_comment tool without an id, which creates the comment.",
  {
    issueId: s.nonEmptyString("Issue ID or human identifier such as ENG-123."),
    body: s.nonEmptyString("Comment body in Markdown."),
    parentId: s.string("Comment ID to reply to, for a threaded reply."),
  },
  { optional: ["parentId"], additionalProperties: true },
);

const listProjectsInputSchema = s.object(
  "Filters forwarded to Linear's MCP list_projects tool. Keys this schema does not name pass through as given.",
  {
    team: s.nonEmptyString("Team key, name or ID whose projects to list."),
    limit: s.integer("Maximum number of projects to return on this page.", { minimum: 1, maximum: 250 }),
    cursor: s.nonEmptyString("Cursor returned by the previous page of the same query."),
  },
  { optional: ["team", "limit", "cursor"], additionalProperties: true },
);

const listIssuesInputSchema = s.object(
  "Filters forwarded to Linear's MCP list_issues tool. Which filters the tool honours is decided by Linear's server; unknown values are rejected there.",
  {
    updatedAt: s.string(
      "Only issues updated at or after this time, as the tool accepts it (an ISO 8601 timestamp or a relative duration such as -P1D).",
    ),
    orderBy: s.string("Sort field, such as updatedAt or createdAt."),
    limit: s.integer("Maximum number of issues to return on this page.", { minimum: 1, maximum: 250 }),
    cursor: s.nonEmptyString("Cursor returned by the previous page of the same query."),
  },
  { optional: ["updatedAt", "orderBy", "limit", "cursor"] },
);

export const linearMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_self",
    operationType: "read",
    description: "Get the signed-in Linear user through Linear's MCP get_user tool.",
    requiredScopes: readScope,
    inputSchema: s.object({}),
    outputSchema: s.requiredObject("The signed-in user.", {
      user: s.nullable(userSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_issues",
    operationType: "read",
    description:
      "List Linear issues through Linear's MCP list_issues tool with optional updated-since, ordering, limit, and cursor pagination. Descriptions may be clipped; call get_issue for the full text.",
    requiredScopes: readScope,
    followUpActions: ["linear_mcp.get_issue", "linear_mcp.list_comments"],
    inputSchema: listIssuesInputSchema,
    outputSchema: s.requiredObject("One page of issues.", {
      issues: s.array("Issues on this page.", issueSchema),
      hasNextPage: s.boolean("Whether another page follows."),
      cursor: s.nullable(s.string("Cursor for the next page, when one is available.")),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_issue",
    operationType: "read",
    description: "Get one Linear issue with its full description through Linear's MCP get_issue tool.",
    requiredScopes: readScope,
    inputSchema: s.requiredObject("The issue to read.", {
      id: s.nonEmptyString("Issue ID or human identifier such as ENG-123, as returned by list_issues."),
    }),
    outputSchema: s.requiredObject("The requested issue.", {
      issue: s.nullable(issueSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_comments",
    operationType: "read",
    description: "List the comments on one Linear issue through Linear's MCP list_comments tool.",
    requiredScopes: readScope,
    inputSchema: s.requiredObject("The issue whose comments to read.", {
      issueId: s.nonEmptyString("Issue ID or human identifier such as ENG-123."),
    }),
    outputSchema: s.requiredObject("Comments on the issue.", {
      comments: s.array("Comments as returned, oldest first when Linear orders them.", commentSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    operationType: "read",
    description:
      "List the teams of the connected Linear workspace through Linear's MCP list_teams tool: the keys and IDs the issue tools take as team.",
    requiredScopes: readScope,
    followUpActions: ["linear_mcp.list_issue_statuses", "linear_mcp.list_issue_labels", "linear_mcp.create_issue"],
    inputSchema: s.object({}),
    outputSchema: s.requiredObject("The teams.", {
      teams: s.array("Teams as returned.", namedRecordSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description:
      "List Linear projects through Linear's MCP list_projects tool, optionally for one team, with cursor pagination.",
    requiredScopes: readScope,
    inputSchema: listProjectsInputSchema,
    outputSchema: s.requiredObject("One page of projects.", {
      projects: s.array("Projects on this page.", namedRecordSchema),
      hasNextPage: s.boolean("Whether another page follows."),
      cursor: s.nullable(s.string("Cursor for the next page, when one is available.")),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_issue_statuses",
    operationType: "read",
    description:
      "List one team's workflow states through Linear's MCP list_issue_statuses tool: the names the issue tools take as state.",
    requiredScopes: readScope,
    inputSchema: s.requiredObject("The team whose workflow states to list.", {
      team: s.nonEmptyString("Team key, name or ID."),
    }),
    outputSchema: s.requiredObject("The workflow states.", {
      statuses: s.array("States as returned.", namedRecordSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_issue_labels",
    operationType: "read",
    description: "List issue labels through Linear's MCP list_issue_labels tool, for the workspace or one team.",
    requiredScopes: readScope,
    inputSchema: s.object(
      "Optional team filter.",
      { team: s.nonEmptyString("Team key, name or ID; omitted, the workspace's labels.") },
      { optional: ["team"] },
    ),
    outputSchema: s.requiredObject("The labels.", {
      labels: s.array("Labels as returned.", namedRecordSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_issue",
    operationType: "write",
    description:
      "Create a Linear issue through Linear's MCP save_issue tool. Needs the write scope on the grant; an id in the input is dropped so this never updates an existing issue.",
    requiredScopes: writeScope,
    followUpActions: ["linear_mcp.get_issue", "linear_mcp.create_comment"],
    inputSchema: createIssueInputSchema,
    outputSchema: s.requiredObject("The created issue.", {
      issue: s.nullable(issueSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_issue",
    operationType: "write",
    description:
      "Update a Linear issue through Linear's MCP save_issue tool with its id: the title, description, team, assignee, state, priority, labels, project, due date, parent or estimate. Needs the write scope on the grant.",
    requiredScopes: writeScope,
    followUpActions: ["linear_mcp.get_issue"],
    inputSchema: updateIssueInputSchema,
    outputSchema: s.requiredObject("The updated issue.", {
      issue: s.nullable(issueSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_comment",
    operationType: "write",
    description:
      "Comment on a Linear issue through Linear's MCP save_comment tool, optionally as a reply to another comment. Needs the write scope on the grant.",
    requiredScopes: writeScope,
    followUpActions: ["linear_mcp.list_comments"],
    inputSchema: createCommentInputSchema,
    outputSchema: s.requiredObject("The created comment.", {
      comment: s.nullable(commentSchema),
      raw: rawSchema,
    }),
  }),
];
