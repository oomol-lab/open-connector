import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { gitlabApiScope, gitlabReadApiScope } from "./scopes.ts";

const service = "gitlab";

interface GitlabActionSource {
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const pagination = {
  page: s.integer({ minimum: 1, description: "The page number to fetch." }),
  perPage: s.integer({ minimum: 1, maximum: 100, description: "The number of results per page." }),
};
const user = s.looseObject(
  {
    id: s.integer({ description: "The GitLab user ID." }),
    username: s.string({ description: "The GitLab username." }),
    name: s.string({ description: "The display name." }),
    state: s.string({ description: "The user state." }),
    avatar_url: s.nullableString("The avatar URL."),
    web_url: s.string({ description: "The GitLab profile URL." }),
    email: s.string({ description: "The email address when visible." }),
    public_email: s.string({ description: "The public email address when visible." }),
  },
  { description: "A GitLab user record." },
);
const namespace = s.looseObject(
  {
    id: s.integer({ description: "The namespace ID." }),
    name: s.string({ description: "The namespace name." }),
    path: s.string({ description: "The namespace path." }),
    kind: s.string({ description: "The namespace kind." }),
    full_path: s.string({ description: "The full namespace path." }),
  },
  { description: "A GitLab namespace record." },
);
const project = s.looseObject(
  {
    id: s.integer({ description: "The project ID." }),
    name: s.string({ description: "The project name." }),
    path: s.string({ description: "The project path." }),
    path_with_namespace: s.string({ description: "The project path including namespace." }),
    description: s.nullableString("The project description."),
    default_branch: s.nullableString("The default branch name."),
    visibility: s.string({ description: "The project visibility." }),
    web_url: s.string({ description: "The project URL." }),
    ssh_url_to_repo: s.string({ description: "The SSH clone URL." }),
    http_url_to_repo: s.string({ description: "The HTTPS clone URL." }),
    readme_url: s.nullableString("The README URL when returned by GitLab."),
    created_at: s.string({ description: "The project creation timestamp." }),
    last_activity_at: s.string({ description: "The last activity timestamp." }),
    archived: s.boolean({ description: "Whether the project is archived." }),
    star_count: s.integer({ description: "The number of stars." }),
    forks_count: s.integer({ description: "The number of forks." }),
    open_issues_count: s.integer({ description: "The number of open issues." }),
    namespace,
  },
  { description: "A GitLab project record." },
);
const milestone = s.looseObject(
  {
    id: s.integer({ description: "The milestone ID." }),
    iid: s.integer({ description: "The internal milestone ID within the project." }),
    title: s.string({ description: "The milestone title." }),
    description: s.nullableString("The milestone description."),
    state: s.string({ description: "The milestone state." }),
    due_date: s.nullableString("The milestone due date."),
    start_date: s.nullableString("The milestone start date."),
    web_url: s.string({ description: "The milestone URL." }),
  },
  { description: "A GitLab milestone record." },
);
const issue = s.looseObject(
  {
    id: s.integer({ description: "The issue ID." }),
    iid: s.integer({ description: "The internal issue ID within the project." }),
    project_id: s.integer({ description: "The project ID." }),
    title: s.string({ description: "The issue title." }),
    description: s.nullableString("The issue description."),
    state: s.string({ description: "The issue state." }),
    web_url: s.string({ description: "The issue URL." }),
    confidential: s.boolean({ description: "Whether the issue is confidential." }),
    discussion_locked: s.nullable(s.boolean({ description: "Whether discussions are locked." })),
    issue_type: s.string({ description: "The GitLab issue type." }),
    author: user,
    assignees: s.array(user, { description: "Users assigned to the issue." }),
    labels: s.array(s.string({ description: "A label name." }), { description: "Labels attached to the issue." }),
    milestone: s.nullable(milestone),
    created_at: s.string({ description: "The issue creation timestamp." }),
    updated_at: s.string({ description: "The issue update timestamp." }),
    closed_at: s.nullableString("The timestamp when the issue was closed."),
    due_date: s.nullableString("The issue due date."),
    user_notes_count: s.integer({ description: "The number of notes on the issue." }),
  },
  { description: "A GitLab issue record." },
);
const paginatedProjects = s.object(
  {
    projects: s.array(project, { description: "Projects returned by GitLab." }),
    total: s.nullable(s.integer({ description: "The total number of projects when GitLab returns it." })),
    nextPage: s.nullable(s.integer({ description: "The next page number when another page exists." })),
  },
  { required: ["projects", "total", "nextPage"], description: "A paginated GitLab projects response." },
);
const paginatedIssues = s.object(
  {
    issues: s.array(issue, { description: "Issues returned by GitLab." }),
    total: s.nullable(s.integer({ description: "The total number of issues when GitLab returns it." })),
    nextPage: s.nullable(s.integer({ description: "The next page number when another page exists." })),
  },
  { required: ["issues", "total", "nextPage"], description: "A paginated GitLab issues response." },
);
const projectId = s.string({
  minLength: 1,
  description: "The GitLab project ID or URL-encoded path with namespace, such as 123 or group%2Fproject.",
});

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "GitLab action input.");
}

const actions: GitlabActionSource[] = [
  {
    name: "get_current_user",
    description: "Get the current authenticated GitLab user profile.",
    requiredScopes: [gitlabReadApiScope],
    inputSchema: input({}),
    outputSchema: user,
  },
  {
    name: "list_projects",
    description:
      "List GitLab projects visible to the authenticated personal access token, with optional search and membership filters.",
    requiredScopes: [gitlabReadApiScope],
    inputSchema: input({
      search: s.string({ minLength: 1, description: "Search projects by name or path." }),
      membership: s.boolean({ description: "Limit results to projects the authenticated user is a member of." }),
      owned: s.boolean({ description: "Limit results to projects explicitly owned by the authenticated user." }),
      simple: s.boolean({ description: "Return a simplified project representation from GitLab." }),
      orderBy: s.stringEnum(["id", "name", "path", "created_at", "updated_at", "last_activity_at"], {
        description: "Sort projects by a GitLab-supported field.",
      }),
      sort: s.stringEnum(["asc", "desc"], { description: "Sort direction." }),
      ...pagination,
    }),
    outputSchema: paginatedProjects,
  },
  {
    name: "get_project",
    description: "Get a GitLab project by numeric ID or URL-encoded path with namespace.",
    requiredScopes: [gitlabReadApiScope],
    inputSchema: input({ projectId }, ["projectId"]),
    outputSchema: project,
  },
  {
    name: "list_project_issues",
    description: "List issues for a GitLab project with common state, label, assignee, and search filters.",
    requiredScopes: [gitlabReadApiScope],
    inputSchema: input(
      {
        projectId,
        state: s.stringEnum(["opened", "closed", "all"], { description: "Issue state filter." }),
        labels: s.string({ minLength: 1, description: "Comma-separated label names to filter issues by." }),
        assigneeId: s.integer({ description: "Filter by assignee user ID." }),
        search: s.string({ minLength: 1, description: "Search issues by title or description." }),
        orderBy: s.stringEnum(
          [
            "created_at",
            "updated_at",
            "priority",
            "due_date",
            "relative_position",
            "label_priority",
            "milestone_due",
            "popularity",
            "weight",
          ],
          { description: "Sort issues by a GitLab-supported field." },
        ),
        sort: s.stringEnum(["asc", "desc"], { description: "Sort direction." }),
        ...pagination,
      },
      ["projectId"],
    ),
    outputSchema: paginatedIssues,
  },
  {
    name: "create_project_issue",
    description: "Create a new issue in a GitLab project.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input(
      {
        projectId,
        title: s.string({ minLength: 1, description: "The issue title." }),
        description: s.string({ minLength: 1, description: "The issue description." }),
        labels: s.string({ minLength: 1, description: "Comma-separated label names to attach to the issue." }),
        assigneeIds: s.array(s.integer({ description: "A GitLab user ID." }), {
          description: "User IDs to assign to the issue.",
        }),
        confidential: s.boolean({ description: "Whether the issue should be confidential." }),
        dueDate: s.string({ minLength: 1, description: "The issue due date in YYYY-MM-DD format." }),
      },
      ["projectId", "title"],
    ),
    outputSchema: issue,
  },
];

export const gitlabActions: ActionDefinition[] = actions.map((action) =>
  defineProviderAction(service, {
    ...action,
    providerPermissions: action.requiredScopes,
  }),
);
