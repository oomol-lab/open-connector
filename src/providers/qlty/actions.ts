import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "qlty";

const pageLimitSchema = s.integer("Maximum number of items to return. Qlty accepts 1-100.", {
  minimum: 1,
  maximum: 100,
});
const pageOffsetSchema = s.integer("Number of items to skip before returning results.", {
  minimum: 0,
});
const qltyPathKeyOrIdSchema = (description: string) => s.string({ description, minLength: 3 });
const ownerKeyOrIdSchema = qltyPathKeyOrIdSchema(
  "Repository owner login or Qlty workspace ID. Must be at least 3 characters.",
);
const workspaceKeyOrIdSchema = qltyPathKeyOrIdSchema("Qlty workspace key or ID. Must be at least 3 characters.");
const projectKeyOrIdSchema = qltyPathKeyOrIdSchema(
  "Repository name or Qlty project ID. Must be at least 3 characters.",
);
const nonEmptyString = (description: string) => s.nonEmptyString(description);

const stringOrArraySchema = (description: string, itemSchema = nonEmptyString(description)) =>
  s.anyOf(description, [itemSchema, s.array(`Multiple values for ${description}`, itemSchema, { minItems: 1 })]);

const issueCategorySchema = s.stringEnum("A Qlty issue category filter.", [
  "bug",
  "vulnerability",
  "structure",
  "duplication",
  "security_hotspot",
  "performance",
  "documentation",
  "type_check",
  "style",
  "anti_pattern",
  "accessibility",
  "dead_code",
  "lint",
  "secret",
  "dependency_alert",
]);
const issueLevelSchema = s.stringEnum("A Qlty issue level filter.", ["high", "medium", "low", "note", "fmt"]);
const issueStatusSchema = s.stringEnum("A Qlty issue status filter.", ["open", "ignored"]);

const rawSchema = s.looseObject("The raw Qlty API response object.");
const userSchema = s.looseObject("A Qlty authenticated user.", {
  id: s.string("The Qlty user ID."),
  login: s.string("The user's login."),
  name: s.string("The user's display name."),
  email: s.string("The user's email address."),
  avatarUrl: s.string("The user's avatar URL."),
  providerUrl: s.string("The upstream provider profile URL."),
  createdAt: s.string("The user creation timestamp."),
  updatedAt: s.string("The user update timestamp."),
});
const workspaceSchema = s.looseObject("A Qlty workspace.", {
  id: s.string("The Qlty workspace ID."),
  key: s.string("The Qlty workspace key."),
  avatarUrl: s.string("The workspace avatar URL."),
  providerUrl: s.string("The upstream provider workspace URL."),
  createdAt: s.string("The workspace creation timestamp."),
  updatedAt: s.string("The workspace update timestamp."),
});
const projectSchema = s.looseObject("A Qlty project.", {
  id: s.string("The Qlty project ID."),
  workspaceId: s.string("The Qlty workspace ID that owns the project."),
  providerUrl: s.string("The upstream provider repository URL."),
  key: s.string("The repository name."),
  workspaceKey: s.string("The key of the workspace that owns the project."),
});
const issueLocationSchema = s.looseObject("A Qlty issue location.", {
  path: s.string("The source file path for the issue."),
  startLine: s.integer("The starting line number for the issue."),
  endLine: s.integer("The ending line number for the issue."),
});
const issueSchema = s.looseObject("A Qlty issue summary.", {
  id: s.string("The Qlty issue ID."),
  fingerprint: s.string("The stable fingerprint for the issue."),
  tool: s.string("The tool that reported the issue."),
  ruleKey: s.string("The rule key reported by the tool."),
  message: s.string("The issue message."),
  category: s.string("The Qlty issue category."),
  level: s.string("The Qlty issue level."),
  status: s.string("The Qlty issue status."),
  documentationUrl: s.string("The documentation URL for the rule when available."),
  location: issueLocationSchema,
});
const metricSchema = s.looseObject("A Qlty metric value.", {
  key: s.string("The metric key."),
  name: s.string("The metric display name."),
  description: s.string("The metric description."),
  category: s.string("The metric category."),
  value: s.anyOf("The latest metric value.", [
    s.number("A numeric metric value."),
    s.string("A string metric value such as a grade or size bucket."),
  ]),
  inverted: s.boolean("Whether higher values are worse for this metric."),
  valueType: s.string("How the metric value should be interpreted."),
});
const rateLimitResourcesSchema = s.looseObject("The Qlty rate-limit resources object.");

export const qltyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_authenticated_user",
    description: "Get the Qlty user associated with the API token.",
    inputSchema: s.object("The input payload for getting the authenticated Qlty user.", {}, { required: [] }),
    outputSchema: s.object(
      "The response returned with the authenticated Qlty user.",
      {
        user: userSchema,
        raw: rawSchema,
      },
      { required: ["user", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Qlty workspaces accessible to the API token.",
    inputSchema: s.object(
      "The input payload for listing Qlty workspaces.",
      {
        limit: pageLimitSchema,
        offset: pageOffsetSchema,
      },
      { required: [], optional: ["limit", "offset"] },
    ),
    outputSchema: s.object(
      "The response returned when listing Qlty workspaces.",
      {
        workspaces: s.array("The workspaces returned by Qlty.", workspaceSchema),
        hasMore: s.boolean("Whether Qlty has more workspaces after this page."),
        raw: rawSchema,
      },
      { required: ["workspaces", "hasMore", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get a Qlty workspace by key or ID.",
    inputSchema: s.object(
      "The input payload for getting a Qlty workspace.",
      {
        keyOrId: workspaceKeyOrIdSchema,
      },
      { required: ["keyOrId"] },
    ),
    outputSchema: s.object(
      "The response returned with a Qlty workspace.",
      {
        workspace: workspaceSchema,
        raw: rawSchema,
      },
      { required: ["workspace", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Qlty projects associated with a workspace or repository owner.",
    inputSchema: s.object(
      "The input payload for listing Qlty projects.",
      {
        ownerKeyOrId: ownerKeyOrIdSchema,
        limit: pageLimitSchema,
        offset: pageOffsetSchema,
      },
      { required: ["ownerKeyOrId"], optional: ["limit", "offset"] },
    ),
    outputSchema: s.object(
      "The response returned when listing Qlty projects.",
      {
        projects: s.array("The projects returned by Qlty.", projectSchema),
        hasMore: s.boolean("Whether Qlty has more projects after this page."),
        raw: rawSchema,
      },
      { required: ["projects", "hasMore", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get a Qlty project by workspace owner and project key or ID.",
    inputSchema: s.object(
      "The input payload for getting a Qlty project.",
      {
        ownerKeyOrId: ownerKeyOrIdSchema,
        keyOrId: projectKeyOrIdSchema,
      },
      { required: ["ownerKeyOrId", "keyOrId"] },
    ),
    outputSchema: s.object(
      "The response returned with a Qlty project.",
      {
        project: projectSchema,
        raw: rawSchema,
      },
      { required: ["project", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_issues",
    description: "List Qlty issues for a project with optional category, level, status, and tool filters.",
    inputSchema: s.object(
      "The input payload for listing Qlty issues.",
      {
        ownerKeyOrId: ownerKeyOrIdSchema,
        projectKeyOrId: projectKeyOrIdSchema,
        limit: pageLimitSchema,
        offset: pageOffsetSchema,
        category: stringOrArraySchema("issue categories to include.", issueCategorySchema),
        level: stringOrArraySchema("issue levels to include.", issueLevelSchema),
        status: stringOrArraySchema("issue statuses to include.", issueStatusSchema),
        tool: stringOrArraySchema("tool names to include."),
      },
      {
        required: ["ownerKeyOrId", "projectKeyOrId"],
        optional: ["limit", "offset", "category", "level", "status", "tool"],
      },
    ),
    outputSchema: s.object(
      "The response returned when listing Qlty issues.",
      {
        issues: s.array("The issues returned by Qlty.", issueSchema),
        hasMore: s.boolean("Whether Qlty has more issues after this page."),
        raw: rawSchema,
      },
      { required: ["issues", "hasMore", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_project_metrics",
    description: "Get the latest Qlty metric values for a project's default branch.",
    inputSchema: s.object(
      "The input payload for getting Qlty project metrics.",
      {
        ownerKeyOrId: ownerKeyOrIdSchema,
        projectKeyOrId: projectKeyOrIdSchema,
      },
      { required: ["ownerKeyOrId", "projectKeyOrId"] },
    ),
    outputSchema: s.object(
      "The response returned with Qlty project metrics.",
      {
        metrics: s.array("The project metrics returned by Qlty.", metricSchema),
        raw: rawSchema,
      },
      { required: ["metrics", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_rate_limit_status",
    description: "Get Qlty API rate-limit status for the API token.",
    inputSchema: s.object("The input payload for getting Qlty API rate-limit status.", {}, { required: [] }),
    outputSchema: s.object(
      "The response returned with Qlty API rate-limit status.",
      {
        resources: rateLimitResourcesSchema,
        raw: rawSchema,
      },
      { required: ["resources", "raw"] },
    ),
  }),
];
