import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "codegen";

const positiveIntegerSchema = (description: string) => s.integer(description, { minimum: 1 });
const nonNegativeIntegerSchema = (description: string) => s.integer(description, { minimum: 0 });

const paginationInputSchemas = {
  skip: nonNegativeIntegerSchema("The number of items to skip before returning results."),
  limit: s.integer("The maximum number of items to return. Codegen allows 1 to 100.", {
    minimum: 1,
    maximum: 100,
  }),
};

const organizationIdSchema = positiveIntegerSchema(
  "The Codegen organization ID. Omit this field to use the organization ID saved with the credential.",
);

const paginationSchema = s.requiredObject("Pagination metadata returned by Codegen.", {
  total: s.integer("The total number of matching records."),
  page: s.integer("The current result page."),
  size: s.integer("The number of items in the page."),
  pages: s.integer("The total number of pages."),
});

const organizationSchema = s.looseObject("A Codegen organization.", {
  id: s.integer("The Codegen organization ID."),
  name: s.string("The organization name."),
  settings: s.looseObject("The organization settings returned by Codegen.", {
    enable_pr_creation: s.boolean("Whether Codegen can create pull requests for this organization."),
    enable_rules_detection: s.boolean("Whether Codegen can detect rules for this organization."),
  }),
});

const userSchema = s.looseObject("A Codegen user.", {
  id: s.integer("The Codegen user ID."),
  email: s.nullable(s.email("The user's email address.")),
  github_user_id: s.string("The user's GitHub user ID."),
  github_username: s.string("The user's GitHub username."),
  avatar_url: s.nullable(s.url("The URL of the user's avatar image.")),
  full_name: s.nullable(s.string("The user's full name.")),
  role: s.nullable(s.string("The user's organization role.")),
  is_admin: s.nullable(s.boolean("Whether the user is an admin.")),
});

const repositorySchema = s.looseObject("A Codegen repository.", {
  id: s.integer("The Codegen repository ID."),
  name: s.string("The repository name."),
  full_name: s.string("The full repository name."),
  description: s.nullable(s.string("The repository description.")),
  github_id: s.string("The GitHub repository ID."),
  organization_id: s.integer("The Codegen organization ID that owns the repository."),
  visibility: s.nullable(s.string("The repository visibility.")),
  archived: s.nullable(s.boolean("Whether the repository is archived.")),
  setup_status: s.string("The repository setup status in Codegen."),
  language: s.nullable(s.string("The primary repository language.")),
});

const sourceTypeSchema = s.stringEnum("The source type used to filter agent runs.", [
  "LOCAL",
  "SLACK",
  "GITHUB",
  "GITHUB_CHECK_SUITE",
  "GITHUB_PR_REVIEW",
  "LINEAR",
  "API",
  "CHAT",
  "JIRA",
  "CLICKUP",
  "MONDAY",
  "SETUP_COMMANDS",
]);

const githubPullRequestSchema = s.looseObject("A GitHub pull request linked to an agent run.", {
  id: s.integer("The Codegen pull request record ID."),
  title: s.nullable(s.string("The pull request title.")),
  url: s.nullable(s.url("The pull request URL.")),
  created_at: s.string("The timestamp when the pull request record was created."),
  head_branch_name: s.nullable(s.string("The pull request head branch name.")),
});

const agentRunSchema = s.looseObject("A Codegen agent run.", {
  id: s.integer("The Codegen agent run ID."),
  organization_id: s.integer("The Codegen organization ID that owns the agent run."),
  status: s.nullable(s.string("The current agent run status.")),
  created_at: s.nullable(s.string("The timestamp when the agent run was created.")),
  web_url: s.nullable(s.url("The Codegen web URL for the agent run.")),
  result: s.nullable(s.string("The final agent run result when available.")),
  summary: s.nullable(s.string("The agent run summary when available.")),
  source_type: s.nullable(sourceTypeSchema),
  github_pull_requests: s.nullable(s.array("GitHub pull requests linked to the agent run.", githubPullRequestSchema)),
  metadata: s.nullable(s.looseObject("Additional Codegen metadata for the agent run.")),
});

export const codegenActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the Codegen user associated with the API token.",
    inputSchema: s.actionInput({}, [], "Input parameters for retrieving the current Codegen user."),
    outputSchema: s.requiredObject("The current Codegen user response.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List Codegen organizations available to the authenticated API token.",
    inputSchema: s.object("Input parameters for listing Codegen organizations.", paginationInputSchemas, {
      optional: ["skip", "limit"],
    }),
    outputSchema: s.requiredObject("The Codegen organizations list response.", {
      organizations: s.array("Organizations returned by Codegen.", organizationSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_repositories",
    description: "List repositories for a Codegen organization.",
    inputSchema: s.object(
      "Input parameters for listing Codegen repositories.",
      {
        org_id: organizationIdSchema,
        ...paginationInputSchemas,
      },
      { optional: ["org_id", "skip", "limit"] },
    ),
    outputSchema: s.requiredObject("The Codegen repositories list response.", {
      repositories: s.array("Repositories returned by Codegen.", repositorySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users for a Codegen organization.",
    inputSchema: s.object(
      "Input parameters for listing Codegen organization users.",
      {
        org_id: organizationIdSchema,
        ...paginationInputSchemas,
      },
      { optional: ["org_id", "skip", "limit"] },
    ),
    outputSchema: s.requiredObject("The Codegen users list response.", {
      users: s.array("Users returned by Codegen.", userSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_agent_runs",
    description: "List Codegen agent runs for an organization.",
    inputSchema: s.object(
      "Input parameters for listing Codegen agent runs.",
      {
        org_id: organizationIdSchema,
        user_id: s.nullable(positiveIntegerSchema("Filter agent runs by the Codegen user ID that started them.")),
        source_type: s.nullable(sourceTypeSchema),
        ...paginationInputSchemas,
      },
      { optional: ["org_id", "user_id", "source_type", "skip", "limit"] },
    ),
    outputSchema: s.requiredObject("The Codegen agent runs list response.", {
      agent_runs: s.array("Agent runs returned by Codegen.", agentRunSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_agent_run",
    description: "Retrieve a single Codegen agent run status and result.",
    inputSchema: s.object(
      "Input parameters for retrieving one Codegen agent run.",
      {
        org_id: organizationIdSchema,
        agent_run_id: positiveIntegerSchema("The Codegen agent run ID to retrieve."),
      },
      { optional: ["org_id"] },
    ),
    outputSchema: s.requiredObject("The Codegen agent run response.", {
      agent_run: agentRunSchema,
    }),
  }),
];
