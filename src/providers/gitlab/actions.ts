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
const mergeRequest = s.looseObject(
  {
    id: s.integer({ description: "The global merge request ID." }),
    iid: s.integer({ description: "The internal merge request ID within the project." }),
    project_id: s.integer({ description: "The target project ID." }),
    title: s.string({ description: "The merge request title." }),
    description: s.nullableString("The merge request description."),
    state: s.string({ description: "The merge request state." }),
    web_url: s.string({ description: "The merge request URL." }),
    source_branch: s.string({ description: "The source branch name." }),
    target_branch: s.string({ description: "The target branch name." }),
    author: user,
    assignees: s.array(user, { description: "Users assigned to the merge request." }),
    reviewers: s.array(user, { description: "Users reviewing the merge request." }),
    labels: s.array(s.string({ description: "A label name." }), {
      description: "Labels attached to the merge request.",
    }),
    merged_at: s.nullableString("The merge timestamp, when merged."),
    merge_status: s.string({ description: "The merge readiness status." }),
    detailed_merge_status: s.string({ description: "The detailed merge readiness status." }),
    sha: s.string({ description: "The source branch commit SHA." }),
  },
  { description: "A GitLab merge request record." },
);
const paginatedMergeRequests = s.object(
  {
    mergeRequests: s.array(mergeRequest, { description: "Merge requests returned by GitLab." }),
    total: s.nullable(s.integer({ description: "The total number of merge requests when GitLab returns it." })),
    nextPage: s.nullable(s.integer({ description: "The next page number when another page exists." })),
  },
  { required: ["mergeRequests", "total", "nextPage"], description: "A paginated GitLab merge requests response." },
);
const deletedOutput = s.object(
  { deleted: s.boolean({ description: "Whether GitLab accepted the deletion request." }) },
  { required: ["deleted"], description: "A normalized GitLab deletion response." },
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
  {
    name: "get_project_issue",
    description: "Get a single issue from a GitLab project by its internal issue ID.",
    requiredScopes: [gitlabReadApiScope],
    inputSchema: input({ projectId, issueIid: s.positiveInteger("The internal issue ID within the project.") }, [
      "projectId",
      "issueIid",
    ]),
    outputSchema: issue,
  },
  {
    name: "update_project_issue",
    description: "Update a GitLab project issue, including its title, labels, assignees, or open/closed state.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input(
      {
        projectId,
        issueIid: s.positiveInteger("The internal issue ID within the project."),
        title: s.string({ minLength: 1, description: "The replacement issue title." }),
        description: s.string({ description: "The replacement issue description." }),
        labels: s.string({ description: "Comma-separated label names to set." }),
        addLabels: s.string({ description: "Comma-separated label names to add." }),
        removeLabels: s.string({ description: "Comma-separated label names to remove." }),
        assigneeIds: s.array(s.integer({ description: "A GitLab user ID." }), { description: "Users to assign." }),
        confidential: s.boolean({ description: "Whether the issue is confidential." }),
        discussionLocked: s.boolean({ description: "Whether issue discussions are locked." }),
        dueDate: s.string({ description: "The due date in YYYY-MM-DD format." }),
        stateEvent: s.stringEnum(["close", "reopen"], { description: "Close or reopen the issue." }),
      },
      ["projectId", "issueIid"],
    ),
    outputSchema: issue,
  },
  {
    name: "delete_project_issue",
    description: "Delete a GitLab project issue.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input({ projectId, issueIid: s.positiveInteger("The internal issue ID within the project.") }, [
      "projectId",
      "issueIid",
    ]),
    outputSchema: deletedOutput,
  },
  {
    name: "create_project",
    description: "Create a new GitLab project owned by the authenticated user.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input(
      {
        name: s.string({ minLength: 1, description: "The project name." }),
        path: s.string({ minLength: 1, description: "The repository path." }),
        namespaceId: s.integer({ description: "The namespace ID for the project." }),
        description: s.string({ description: "The project description." }),
        visibility: s.stringEnum(["private", "internal", "public"], { description: "The project visibility." }),
        initializeWithReadme: s.boolean({ description: "Whether to initialize the repository with a README." }),
        defaultBranch: s.string({ description: "The initial default branch name." }),
      },
      ["name"],
    ),
    outputSchema: project,
  },
  {
    name: "update_project",
    description: "Update basic settings for an existing GitLab project.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input(
      {
        projectId,
        name: s.string({ minLength: 1, description: "The replacement project name." }),
        path: s.string({ minLength: 1, description: "The replacement repository path." }),
        description: s.string({ description: "The replacement project description." }),
        visibility: s.stringEnum(["private", "internal", "public"], { description: "The project visibility." }),
        defaultBranch: s.string({ description: "The default branch name." }),
        archived: s.boolean({ description: "Whether the project is archived." }),
        issuesAccessLevel: s.stringEnum(["disabled", "private", "enabled"], { description: "Issue visibility." }),
        mergeRequestsAccessLevel: s.stringEnum(["disabled", "private", "enabled"], {
          description: "Merge request visibility.",
        }),
      },
      ["projectId"],
    ),
    outputSchema: project,
  },
  {
    name: "delete_project",
    description: "Mark a GitLab project for deletion.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input({ projectId }, ["projectId"]),
    outputSchema: deletedOutput,
  },
  {
    name: "list_project_merge_requests",
    description: "List merge requests for a GitLab project with state, branch, search, and pagination filters.",
    requiredScopes: [gitlabReadApiScope],
    inputSchema: input(
      {
        projectId,
        state: s.stringEnum(["opened", "closed", "merged", "locked", "all"], { description: "Merge request state." }),
        search: s.string({ minLength: 1, description: "Search merge requests by title or description." }),
        sourceBranch: s.string({ minLength: 1, description: "Filter by source branch." }),
        targetBranch: s.string({ minLength: 1, description: "Filter by target branch." }),
        orderBy: s.stringEnum(["created_at", "updated_at", "priority", "title"], { description: "Sort field." }),
        sort: s.stringEnum(["asc", "desc"], { description: "Sort direction." }),
        ...pagination,
      },
      ["projectId"],
    ),
    outputSchema: paginatedMergeRequests,
  },
  {
    name: "create_merge_request",
    description: "Create a GitLab merge request from a source branch into a target branch.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input(
      {
        projectId,
        sourceBranch: s.string({ minLength: 1, description: "The source branch name." }),
        targetBranch: s.string({ minLength: 1, description: "The target branch name." }),
        title: s.string({ minLength: 1, description: "The merge request title." }),
        description: s.string({ description: "The merge request description." }),
        targetProjectId: s.integer({ description: "The target project ID for a cross-project merge request." }),
        assigneeIds: s.array(s.integer({ description: "A GitLab user ID." }), { description: "Users to assign." }),
        reviewerIds: s.array(s.integer({ description: "A GitLab user ID." }), { description: "Users to review." }),
        labels: s.string({ description: "Comma-separated label names." }),
        removeSourceBranch: s.boolean({ description: "Whether to remove the source branch after merge." }),
        squash: s.boolean({ description: "Whether to squash commits when merging." }),
      },
      ["projectId", "sourceBranch", "targetBranch", "title"],
    ),
    outputSchema: mergeRequest,
  },
  {
    name: "update_merge_request",
    description: "Update a GitLab merge request's title, description, branches, reviewers, labels, or state.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input(
      {
        projectId,
        mergeRequestIid: s.positiveInteger("The internal merge request ID within the project."),
        title: s.string({ minLength: 1, description: "The replacement title." }),
        description: s.string({ description: "The replacement description." }),
        targetBranch: s.string({ minLength: 1, description: "The replacement target branch." }),
        stateEvent: s.stringEnum(["close", "reopen"], { description: "Close or reopen the merge request." }),
        labels: s.string({ description: "Comma-separated label names to set." }),
        assigneeIds: s.array(s.integer({ description: "A GitLab user ID." }), { description: "Users to assign." }),
        reviewerIds: s.array(s.integer({ description: "A GitLab user ID." }), { description: "Users to review." }),
        milestoneId: s.integer({ description: "The milestone ID." }),
        removeSourceBranch: s.boolean({ description: "Whether to remove the source branch after merge." }),
        squash: s.boolean({ description: "Whether to squash commits when merging." }),
        allowCollaboration: s.boolean({ description: "Allow commits from eligible project members." }),
      },
      ["projectId", "mergeRequestIid"],
    ),
    outputSchema: mergeRequest,
  },
  {
    name: "merge_merge_request",
    description: "Accept and merge a GitLab merge request, optionally waiting for pipelines or squashing commits.",
    requiredScopes: [gitlabApiScope],
    inputSchema: input(
      {
        projectId,
        mergeRequestIid: s.positiveInteger("The internal merge request ID within the project."),
        autoMerge: s.boolean({ description: "Merge automatically when checks pass. Requires GitLab 17.11 or later." }),
        sha: s.string({ minLength: 1, description: "Require this source branch commit SHA before merging." }),
        shouldRemoveSourceBranch: s.boolean({ description: "Remove the source branch after merging." }),
        squash: s.boolean({ description: "Squash commits when merging." }),
        mergeCommitMessage: s.string({ description: "Custom merge commit message." }),
        squashCommitMessage: s.string({ description: "Custom squash commit message." }),
      },
      ["projectId", "mergeRequestIid"],
    ),
    outputSchema: mergeRequest,
  },
];

export const gitlabActions: ActionDefinition[] = actions.map((action) =>
  defineProviderAction(service, {
    ...action,
    providerPermissions: action.requiredScopes,
  }),
);
