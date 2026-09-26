import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linear_mcp";
const readScope = ["read"];

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
  "A Linear issue. Typed fields are lifted from the MCP record when present; unknown fields are kept as returned.",
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
];
