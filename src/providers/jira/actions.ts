import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { jiraReadScopes, jiraWriteScopes } from "./scopes.ts";

const service = "jira";

interface JiraActionSource {
  name: JiraActionName;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const objectSchema = s.record(true, { description: "Jira API object." });
const adfDocument = s.object(
  {
    type: s.literal("doc", { description: "ADF root node type." }),
    version: s.integer({ description: "ADF document version." }),
    content: s.array(s.unknown("ADF top-level node."), { description: "ADF content nodes." }),
  },
  {
    required: ["type", "version", "content"],
    additionalProperties: true,
    description: "Atlassian Document Format document.",
  },
);
const expand = s.array(s.string({ minLength: 1, description: "Jira expand token." }), {
  minItems: 1,
  description: "Additional Jira expand tokens.",
});
const includeFields = s.array(s.string({ minLength: 1, description: "Jira field ID or name." }), {
  minItems: 1,
  description: "Additional Jira issue fields.",
});
const limit = s.integer({ minimum: 1, maximum: 100, description: "Maximum items to return in one Jira page." });
const opaqueCursor = s.string({ minLength: 1, description: "Opaque pagination cursor returned by Jira." });
const startAtCursor = s.stringPattern("^\\d+$", {
  description: "StartAt pagination cursor as a non-negative integer string.",
});
const pagination = s.object(
  {
    nextCursor: s.nullable(s.string({ description: "Cursor for the next page." })),
  },
  { required: ["nextCursor"], description: "Jira pagination metadata." },
);
const project = s.object(
  {
    id: s.string({ description: "Jira project ID." }),
    key: s.string({ description: "Jira project key." }),
    name: s.string({ description: "Jira project name." }),
    raw: objectSchema,
  },
  { additionalProperties: true, description: "Jira project." },
);
const issue = s.object(
  {
    id: s.string({ description: "Jira issue ID." }),
    key: s.string({ description: "Jira issue key." }),
    summary: s.string({ description: "Jira issue summary." }),
    fields: objectSchema,
    raw: objectSchema,
  },
  { additionalProperties: true, description: "Jira issue." },
);
const commentBody = s.union(
  [adfDocument, s.string({ description: "Plain text comment body (Jira Server/Data Center)." })],
  {
    description: "Jira comment body: an ADF document (Cloud) or plain text (Server/Data Center).",
  },
);
const comment = s.object(
  {
    id: s.string({ description: "Jira comment ID." }),
    body: commentBody,
    raw: objectSchema,
  },
  { additionalProperties: true, description: "Jira comment." },
);

const actions: JiraActionSource[] = [
  action(
    "list_projects",
    "List Jira projects available to the connected Jira site.",
    jiraReadScopes,
    input({
      limit,
      cursor: startAtCursor,
      expand,
    }),
    object({ projects: s.array(project), pagination }),
  ),
  action(
    "get_project",
    "Get one Jira project by project ID or key.",
    jiraReadScopes,
    input(
      {
        projectIdOrKey: s.string({ minLength: 1, description: "Jira project ID or key." }),
        expand,
      },
      ["projectIdOrKey"],
    ),
    object({ project }),
  ),
  action(
    "search_issues",
    "Search Jira issues with JQL on the connected Jira site.",
    jiraReadScopes,
    input(
      {
        jql: s.string({ minLength: 1, description: "Jira Query Language string." }),
        limit,
        cursor: opaqueCursor,
        includeFields,
        expand,
      },
      ["jql"],
    ),
    object({ issues: s.array(issue), pagination }),
  ),
  action(
    "get_issue",
    "Get one Jira issue by issue ID or key.",
    jiraReadScopes,
    input(
      {
        issueIdOrKey: s.string({ minLength: 1, description: "Jira issue ID or key." }),
        includeFields,
        expand,
      },
      ["issueIdOrKey"],
    ),
    object({ issue }),
  ),
  action(
    "create_issue",
    "Create a Jira issue and return the normalized issue detail.",
    jiraWriteScopes,
    input(
      {
        projectKey: s.string({ minLength: 1, description: "Jira project key." }),
        projectId: s.string({ minLength: 1, description: "Jira project ID." }),
        issueTypeId: s.string({ minLength: 1, description: "Jira issue type ID." }),
        issueTypeName: s.string({ minLength: 1, description: "Jira issue type name." }),
        summary: s.string({ minLength: 1, description: "Jira issue summary." }),
        descriptionText: s.string({ minLength: 1, description: "Plain text description converted to ADF." }),
        description: adfDocument,
        labels: s.array(s.string({ minLength: 1 }), { minItems: 1, description: "Jira labels." }),
        assigneeAccountId: s.string({ minLength: 1, description: "Assignee account ID." }),
        priorityId: s.string({ minLength: 1, description: "Jira priority ID." }),
        dueDate: s.date("Jira due date in YYYY-MM-DD format."),
        parentIssueKey: s.string({ minLength: 1, description: "Parent issue key for subtasks." }),
        extraFields: objectSchema,
      },
      ["summary"],
    ),
    object({ issue }),
  ),
  action(
    "list_issue_comments",
    "List comments for one Jira issue.",
    jiraReadScopes,
    input(
      {
        issueIdOrKey: s.string({ minLength: 1, description: "Jira issue ID or key." }),
        limit,
        cursor: startAtCursor,
        expand,
      },
      ["issueIdOrKey"],
    ),
    object({ comments: s.array(comment), pagination }),
  ),
  action(
    "add_comment",
    "Add a comment to one Jira issue.",
    jiraWriteScopes,
    input(
      {
        issueIdOrKey: s.string({ minLength: 1, description: "Jira issue ID or key." }),
        bodyText: s.string({ minLength: 1, description: "Plain text comment body converted to ADF." }),
        body: adfDocument,
      },
      ["issueIdOrKey"],
    ),
    object({ comment }),
  ),
];

export type JiraActionName =
  | "list_projects"
  | "get_project"
  | "search_issues"
  | "get_issue"
  | "create_issue"
  | "list_issue_comments"
  | "add_comment";

export const jiraActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    name: source.name,
    description: source.description,
    requiredScopes: source.requiredScopes,
    providerPermissions: source.requiredScopes,
    inputSchema: source.inputSchema,
    outputSchema: source.outputSchema,
  }),
);

function action(
  name: JiraActionName,
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): JiraActionSource {
  return { name, description, requiredScopes, inputSchema, outputSchema };
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "The input payload for this action.");
}

function object(properties: Record<string, JsonSchema>): JsonSchema {
  return s.actionOutput(properties, "Jira action output.");
}
