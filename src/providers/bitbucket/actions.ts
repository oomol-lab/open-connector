import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bitbucket" as const;

export const bitbucketScopes = {
  accountRead: "bitbucket.account.read",
  workspaceRead: "bitbucket.workspace.read",
  projectRead: "bitbucket.project.read",
  repositoryRead: "bitbucket.repository.read",
  repositoryWrite: "bitbucket.repository.write",
  repositoryDelete: "bitbucket.repository.delete",
  pullRequestRead: "bitbucket.pull_request.read",
  pullRequestWrite: "bitbucket.pull_request.write",
  pullRequestCommentWrite: "bitbucket.pull_request.comment.write",
  issueRead: "bitbucket.issue.read",
  issueInteract: "bitbucket.issue.interact",
  issueWrite: "bitbucket.issue.write",
  snippetRead: "bitbucket.snippet.read",
  pipelineRead: "bitbucket.pipeline.read",
  pipelineRun: "bitbucket.pipeline.run",
  pipelineWrite: "bitbucket.pipeline.write",
  pipelineVariableWrite: "bitbucket.pipeline.variable.write",
  runnerRead: "bitbucket.runner.read",
} as const;

const paginationFields = {
  page: s.integer("The page number to fetch.", { minimum: 1 }),
  pageLength: s.integer("The maximum number of records per page.", {
    minimum: 1,
    maximum: 100,
  }),
  query: s.nonEmptyString("A Bitbucket filter expression passed as the q query parameter."),
  sort: s.nonEmptyString("A Bitbucket sort expression passed as the sort query parameter."),
};

const workspaceField = {
  workspace: s.nonEmptyString("The workspace slug or UUID."),
};

const repositoryFields = {
  ...workspaceField,
  repository: s.nonEmptyString("The repository slug or UUID."),
};

const bitbucketObject = (description: string) => s.looseObject(description);

const userSchema = s.looseObject("A Bitbucket account record.", {
  uuid: s.string("The account UUID."),
  account_id: s.string("The Atlassian account ID."),
  nickname: s.string("The account nickname."),
  display_name: s.string("The display name."),
  type: s.string("The account type."),
});

const workspaceSchema = s.looseObject("A Bitbucket workspace record.", {
  uuid: s.string("The workspace UUID."),
  slug: s.string("The workspace slug."),
  name: s.string("The workspace display name."),
  type: s.string("The object type."),
});

const repositorySchema = s.looseObject("A Bitbucket repository record.", {
  uuid: s.string("The repository UUID."),
  slug: s.string("The repository slug."),
  name: s.string("The repository name."),
  full_name: s.string("The workspace and repository slug."),
  is_private: s.boolean("Whether the repository is private."),
  mainbranch: s.nullable(bitbucketObject("The main branch when one exists.")),
});

const branchSchema = s.looseObject("A Bitbucket branch record.", {
  name: s.string("The branch name."),
  type: s.string("The reference type."),
  target: bitbucketObject("The commit targeted by the branch."),
});

const commitSchema = s.looseObject("A Bitbucket commit record.", {
  hash: s.string("The commit hash."),
  date: s.string("The commit timestamp."),
  message: s.string("The commit message."),
  type: s.string("The object type."),
});

const pullRequestSchema = s.looseObject("A Bitbucket pull request record.", {
  id: s.integer("The pull request ID within the repository."),
  title: s.string("The pull request title."),
  state: s.string("The pull request state."),
  source: bitbucketObject("The source branch and repository."),
  destination: bitbucketObject("The destination branch and repository."),
});

const mergePullRequestOutputSchema = s.object("The result of a pull request merge request.", {
  status: s.stringEnum("Whether the merge completed immediately or was queued.", ["completed", "queued"]),
  pullRequest: s.nullable(pullRequestSchema),
  taskId: s.nullableString("The asynchronous merge task ID when the merge was queued."),
  taskStatusUrl: s.nullableString("The Bitbucket URL for polling the asynchronous merge task when one exists."),
});

const mergeTaskStatusSchema = s.looseObject("A Bitbucket pull request merge task status.", {
  task_status: s.string("The current merge task status, such as PENDING or SUCCESS."),
  links: bitbucketObject("Links related to the merge task."),
  merge_result: s.nullable(pullRequestSchema),
});

const issueSchema = s.looseObject("A Bitbucket issue record.", {
  id: s.integer("The issue ID within the repository."),
  title: s.string("The issue title."),
  state: s.string("The issue state."),
  kind: s.string("The issue kind."),
  priority: s.string("The issue priority."),
});

const updateIssueInputSchema = {
  ...s.object(
    "Input parameters for updating a Bitbucket issue. At least one update field is required.",
    {
      ...repositoryFields,
      issueId: s.integer("The issue ID.", { minimum: 1 }),
      title: s.nonEmptyString("The updated issue title."),
      content: s.string("The updated issue description in Bitbucket markup."),
      state: s.stringEnum("The updated issue state.", [
        "new",
        "open",
        "resolved",
        "on hold",
        "invalid",
        "duplicate",
        "wontfix",
        "closed",
      ]),
      kind: s.stringEnum("The updated issue kind.", ["bug", "enhancement", "proposal", "task"]),
      priority: s.stringEnum("The updated issue priority.", ["trivial", "minor", "major", "critical", "blocker"]),
    },
    { optional: ["title", "content", "state", "kind", "priority"] },
  ),
  anyOf: ["title", "content", "state", "kind", "priority"].map((field) => ({
    required: [field],
    description: `The request updates the ${field} field.`,
  })),
};

const commentSchema = s.looseObject("A Bitbucket comment record.", {
  id: s.integer("The comment ID."),
  content: bitbucketObject("The comment content in raw and rendered forms."),
  user: userSchema,
});

const pipelineSchema = s.looseObject("A Bitbucket Pipelines run record.", {
  uuid: s.string("The pipeline UUID."),
  build_number: s.integer("The pipeline build number."),
  state: bitbucketObject("The pipeline state."),
  target: bitbucketObject("The pipeline target."),
  status: s.stringEnum("The normalized pipeline execution status.", ["running", "succeeded", "failed"]),
});

const variableSchema = s.looseObject("A Bitbucket Pipelines variable record.", {
  uuid: s.string("The variable UUID."),
  key: s.string("The variable key."),
  value: s.string("The variable value when it is not secured."),
  secured: s.boolean("Whether the variable is secured."),
});

function paginatedSchema(description: string, field: string, item: Record<string, unknown>) {
  return s.object(description, {
    [field]: s.array(`The ${field} returned by Bitbucket.`, item),
    page: s.nullableInteger("The current page number when returned by Bitbucket."),
    pageLength: s.nullableInteger("The page length when returned by Bitbucket."),
    size: s.nullableInteger("The total number of records when returned by Bitbucket."),
    next: s.nullableString("The URL of the next page when one exists."),
    previous: s.nullableString("The URL of the previous page when one exists."),
  });
}

function listAction(input: {
  name: string;
  description: string;
  scope: string;
  collection: string;
  itemSchema: Record<string, unknown>;
  fields?: Record<string, Record<string, unknown>>;
  required?: string[];
}) {
  const fields = { ...(input.fields ?? {}), ...paginationFields };
  return defineProviderAction(service, {
    name: input.name,
    description: input.description,
    requiredScopes: [input.scope],

    inputSchema: s.object(`Input parameters for ${input.description.toLowerCase()}`, fields, {
      required: input.required ?? [],
      optional: Object.keys(fields).filter((key) => !(input.required ?? []).includes(key)),
    }),
    outputSchema: paginatedSchema(
      `A paginated response containing ${input.collection}.`,
      input.collection,
      input.itemSchema,
    ),
  });
}

const rawContentField = {
  content: s.nonEmptyString("The comment or issue content in Bitbucket markup."),
};

export const bitbucketActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the currently authenticated Bitbucket user.",
    requiredScopes: [bitbucketScopes.accountRead],
    inputSchema: s.object("Input parameters for getting the current Bitbucket user.", {}),
    outputSchema: userSchema,
  }),
  listAction({
    name: "list_workspaces",
    description: "List workspaces available to the authenticated Bitbucket user.",
    scope: bitbucketScopes.accountRead,
    collection: "workspaces",
    itemSchema: workspaceSchema,
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get a Bitbucket workspace by slug or UUID.",
    requiredScopes: [bitbucketScopes.workspaceRead],
    inputSchema: s.object("Input parameters for getting a Bitbucket workspace.", workspaceField),
    outputSchema: workspaceSchema,
  }),
  listAction({
    name: "list_workspace_members",
    description: "List members of a Bitbucket workspace.",
    scope: bitbucketScopes.accountRead,
    collection: "members",
    itemSchema: bitbucketObject("A Bitbucket workspace membership record."),
    fields: workspaceField,
    required: ["workspace"],
  }),
  listAction({
    name: "list_workspace_projects",
    description: "List projects in a Bitbucket workspace.",
    scope: bitbucketScopes.projectRead,
    collection: "projects",
    itemSchema: bitbucketObject("A Bitbucket project record."),
    fields: workspaceField,
    required: ["workspace"],
  }),
  listAction({
    name: "list_repositories",
    description: "List repositories in a Bitbucket workspace.",
    scope: bitbucketScopes.repositoryRead,
    collection: "repositories",
    itemSchema: repositorySchema,
    fields: workspaceField,
    required: ["workspace"],
  }),
  defineProviderAction(service, {
    name: "get_repository",
    description: "Get a Bitbucket repository by workspace and repository slug or UUID.",
    requiredScopes: [bitbucketScopes.repositoryRead],
    inputSchema: s.object("Input parameters for getting a Bitbucket repository.", repositoryFields),
    outputSchema: repositorySchema,
  }),
  defineProviderAction(service, {
    name: "delete_repository",
    description: "Permanently delete a Bitbucket repository.",
    requiredScopes: [bitbucketScopes.repositoryDelete],
    inputSchema: s.object("Input parameters for deleting a Bitbucket repository.", repositoryFields),
    outputSchema: s.object("Repository deletion acknowledgement.", {
      ok: s.boolean("Whether Bitbucket accepted the repository deletion."),
    }),
  }),
  listAction({
    name: "list_branches",
    description: "List branches in a Bitbucket repository.",
    scope: bitbucketScopes.repositoryRead,
    collection: "branches",
    itemSchema: branchSchema,
    fields: repositoryFields,
    required: ["workspace", "repository"],
  }),
  defineProviderAction(service, {
    name: "get_branch",
    description: "Get a branch in a Bitbucket repository.",
    requiredScopes: [bitbucketScopes.repositoryRead],
    inputSchema: s.object("Input parameters for getting a Bitbucket branch.", {
      ...repositoryFields,
      branch: s.nonEmptyString("The branch name."),
    }),
    outputSchema: branchSchema,
  }),
  defineProviderAction(service, {
    name: "create_branch",
    description: "Create a branch from a commit hash or existing revision in a Bitbucket repository.",
    requiredScopes: [bitbucketScopes.repositoryWrite],
    inputSchema: s.object("Input parameters for creating a Bitbucket branch.", {
      ...repositoryFields,
      name: s.nonEmptyString("The new branch name."),
      target: s.nonEmptyString("The commit hash or existing revision for the new branch."),
    }),
    outputSchema: branchSchema,
  }),
  defineProviderAction(service, {
    name: "delete_branch",
    description: "Delete a branch from a Bitbucket repository.",
    requiredScopes: [bitbucketScopes.repositoryWrite],
    inputSchema: s.object("Input parameters for deleting a Bitbucket branch.", {
      ...repositoryFields,
      branch: s.nonEmptyString("The branch name."),
    }),
    outputSchema: s.object("Branch deletion acknowledgement.", {
      ok: s.boolean("Whether Bitbucket accepted the branch deletion."),
    }),
  }),
  listAction({
    name: "list_tags",
    description: "List tags in a Bitbucket repository.",
    scope: bitbucketScopes.repositoryRead,
    collection: "tags",
    itemSchema: bitbucketObject("A Bitbucket tag record."),
    fields: repositoryFields,
    required: ["workspace", "repository"],
  }),
  listAction({
    name: "list_commits",
    description: "List commits in a Bitbucket repository, optionally starting from a revision.",
    scope: bitbucketScopes.repositoryRead,
    collection: "commits",
    itemSchema: commitSchema,
    fields: {
      ...repositoryFields,
      revision: s.nonEmptyString("An optional branch, tag, or commit to start the history from."),
      include: s.nonEmptyString("A revision whose ancestors should be included."),
      exclude: s.nonEmptyString("A revision whose ancestors should be excluded."),
    },
    required: ["workspace", "repository"],
  }),
  defineProviderAction(service, {
    name: "get_commit",
    description: "Get a commit from a Bitbucket repository.",
    requiredScopes: [bitbucketScopes.repositoryRead],
    inputSchema: s.object("Input parameters for getting a Bitbucket commit.", {
      ...repositoryFields,
      commit: s.nonEmptyString("The commit hash or revision."),
    }),
    outputSchema: commitSchema,
  }),
  listAction({
    name: "list_pull_requests",
    description: "List pull requests in a Bitbucket repository.",
    scope: bitbucketScopes.pullRequestRead,
    collection: "pullRequests",
    itemSchema: pullRequestSchema,
    fields: {
      ...repositoryFields,
      state: s.stringEnum("The pull request state to return.", ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]),
    },
    required: ["workspace", "repository"],
  }),
  defineProviderAction(service, {
    name: "get_pull_request",
    description: "Get a pull request from a Bitbucket repository.",
    requiredScopes: [bitbucketScopes.pullRequestRead],
    inputSchema: s.object("Input parameters for getting a Bitbucket pull request.", {
      ...repositoryFields,
      pullRequestId: s.integer("The pull request ID.", { minimum: 1 }),
    }),
    outputSchema: pullRequestSchema,
  }),
  defineProviderAction(service, {
    name: "create_pull_request",
    description: "Create a pull request in a Bitbucket repository.",
    requiredScopes: [bitbucketScopes.pullRequestWrite],
    inputSchema: s.object(
      "Input parameters for creating a Bitbucket pull request.",
      {
        ...repositoryFields,
        title: s.nonEmptyString("The pull request title."),
        sourceBranch: s.nonEmptyString("The source branch name."),
        destinationBranch: s.nonEmptyString("The destination branch name. Omit to use the repository main branch."),
        description: s.string("The pull request description in Bitbucket markup."),
        closeSourceBranch: s.boolean("Whether to close the source branch after merge."),
        draft: s.boolean("Whether to create the pull request as a draft."),
        reviewerUuids: s.stringArray("Bitbucket account UUIDs to request as reviewers."),
      },
      {
        optional: ["destinationBranch", "description", "closeSourceBranch", "draft", "reviewerUuids"],
      },
    ),
    outputSchema: pullRequestSchema,
  }),
  defineProviderAction(service, {
    name: "merge_pull_request",
    description: "Merge a Bitbucket pull request.",
    requiredScopes: [bitbucketScopes.pullRequestWrite],
    inputSchema: s.object(
      "Input parameters for merging a Bitbucket pull request.",
      {
        ...repositoryFields,
        pullRequestId: s.integer("The pull request ID.", { minimum: 1 }),
        message: s.string("The merge commit message."),
        closeSourceBranch: s.boolean("Whether to close the source branch after merge."),
        mergeStrategy: s.stringEnum("The merge strategy.", [
          "merge_commit",
          "squash",
          "fast_forward",
          "squash_fast_forward",
          "rebase_fast_forward",
          "rebase_merge",
        ]),
      },
      { optional: ["message", "closeSourceBranch", "mergeStrategy"] },
    ),
    outputSchema: mergePullRequestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_pull_request_merge_task_status",
    description: "Get the status of an asynchronous Bitbucket pull request merge task.",
    requiredScopes: [bitbucketScopes.pullRequestRead],
    inputSchema: s.object("Input parameters for getting a pull request merge task status.", {
      ...repositoryFields,
      pullRequestId: s.integer("The pull request ID.", { minimum: 1 }),
      taskId: s.nonEmptyString("The asynchronous merge task ID."),
    }),
    outputSchema: mergeTaskStatusSchema,
  }),
  defineProviderAction(service, {
    name: "decline_pull_request",
    description: "Decline a Bitbucket pull request.",
    requiredScopes: [bitbucketScopes.pullRequestWrite],
    inputSchema: s.object("Input parameters for declining a Bitbucket pull request.", {
      ...repositoryFields,
      pullRequestId: s.integer("The pull request ID.", { minimum: 1 }),
    }),
    outputSchema: pullRequestSchema,
  }),
  defineProviderAction(service, {
    name: "approve_pull_request",
    description: "Approve a Bitbucket pull request.",
    requiredScopes: [bitbucketScopes.pullRequestWrite],
    inputSchema: s.object("Input parameters for approving a Bitbucket pull request.", {
      ...repositoryFields,
      pullRequestId: s.integer("The pull request ID.", { minimum: 1 }),
    }),
    outputSchema: bitbucketObject("The authenticated user's pull request participant record."),
  }),
  listAction({
    name: "list_pull_request_comments",
    description: "List comments on a Bitbucket pull request.",
    scope: bitbucketScopes.pullRequestRead,
    collection: "comments",
    itemSchema: commentSchema,
    fields: {
      ...repositoryFields,
      pullRequestId: s.integer("The pull request ID.", { minimum: 1 }),
    },
    required: ["workspace", "repository", "pullRequestId"],
  }),
  defineProviderAction(service, {
    name: "create_pull_request_comment",
    description: "Create a comment on a Bitbucket pull request.",
    requiredScopes: [bitbucketScopes.pullRequestCommentWrite],
    inputSchema: s.object("Input parameters for commenting on a Bitbucket pull request.", {
      ...repositoryFields,
      pullRequestId: s.integer("The pull request ID.", { minimum: 1 }),
      ...rawContentField,
    }),
    outputSchema: commentSchema,
  }),
  listAction({
    name: "list_issues",
    description: "List issues in a repository that still supports the deprecated Bitbucket issue tracker.",
    scope: bitbucketScopes.issueRead,
    collection: "issues",
    itemSchema: issueSchema,
    fields: repositoryFields,
    required: ["workspace", "repository"],
  }),
  defineProviderAction(service, {
    name: "get_issue",
    description: "Get an issue from a repository that still supports the deprecated Bitbucket issue tracker.",
    requiredScopes: [bitbucketScopes.issueRead],
    inputSchema: s.object("Input parameters for getting a Bitbucket issue.", {
      ...repositoryFields,
      issueId: s.integer("The issue ID.", { minimum: 1 }),
    }),
    outputSchema: issueSchema,
  }),
  defineProviderAction(service, {
    name: "create_issue",
    description: "Create an issue in a repository that still supports the deprecated Bitbucket issue tracker.",
    requiredScopes: [bitbucketScopes.issueInteract],
    inputSchema: s.object(
      "Input parameters for creating a Bitbucket issue.",
      {
        ...repositoryFields,
        title: s.nonEmptyString("The issue title."),
        content: s.string("The issue description in Bitbucket markup."),
        kind: s.stringEnum("The issue kind.", ["bug", "enhancement", "proposal", "task"]),
        priority: s.stringEnum("The issue priority.", ["trivial", "minor", "major", "critical", "blocker"]),
      },
      { optional: ["content", "kind", "priority"] },
    ),
    outputSchema: issueSchema,
  }),
  defineProviderAction(service, {
    name: "update_issue",
    description: "Update an issue in a repository that still supports the deprecated Bitbucket issue tracker.",
    requiredScopes: [bitbucketScopes.issueWrite],
    inputSchema: updateIssueInputSchema,
    outputSchema: issueSchema,
  }),
  listAction({
    name: "list_issue_comments",
    description: "List issue comments in a repository that still supports the deprecated Bitbucket issue tracker.",
    scope: bitbucketScopes.issueRead,
    collection: "comments",
    itemSchema: commentSchema,
    fields: {
      ...repositoryFields,
      issueId: s.integer("The issue ID.", { minimum: 1 }),
    },
    required: ["workspace", "repository", "issueId"],
  }),
  defineProviderAction(service, {
    name: "create_issue_comment",
    description: "Create an issue comment in a repository that still supports the deprecated Bitbucket issue tracker.",
    requiredScopes: [bitbucketScopes.issueInteract],
    inputSchema: s.object("Input parameters for commenting on a Bitbucket issue.", {
      ...repositoryFields,
      issueId: s.integer("The issue ID.", { minimum: 1 }),
      ...rawContentField,
    }),
    outputSchema: s.object("Issue comment creation acknowledgement.", {
      created: s.boolean("Whether Bitbucket accepted the issue comment."),
      location: s.nullableString("The URL of the created issue comment when returned by Bitbucket."),
    }),
  }),
  listAction({
    name: "list_snippets",
    description: "List snippets owned by or visible through a Bitbucket workspace.",
    scope: bitbucketScopes.snippetRead,
    collection: "snippets",
    itemSchema: bitbucketObject("A Bitbucket snippet record."),
    fields: {
      workspace: s.nonEmptyString("The optional workspace slug or UUID. Omit to list current-user snippets."),
      role: s.stringEnum("The current user's relationship to returned snippets.", ["owner", "contributor", "member"]),
    },
  }),
  defineProviderAction(service, {
    name: "get_snippet",
    description: "Get a Bitbucket snippet by workspace and encoded snippet ID.",
    requiredScopes: [bitbucketScopes.snippetRead],
    inputSchema: s.object("Input parameters for getting a Bitbucket snippet.", {
      ...workspaceField,
      snippetId: s.nonEmptyString("The snippet ID."),
    }),
    outputSchema: bitbucketObject("A Bitbucket snippet record."),
  }),
  listAction({
    name: "list_pipelines",
    description: "List Pipelines runs for a Bitbucket repository.",
    scope: bitbucketScopes.pipelineRead,
    collection: "pipelines",
    itemSchema: pipelineSchema,
    fields: repositoryFields,
    required: ["workspace", "repository"],
  }),
  defineProviderAction(service, {
    name: "get_pipeline",
    description: "Get a Pipelines run from a Bitbucket repository.",
    requiredScopes: [bitbucketScopes.pipelineRead],

    asyncLifecycle: {
      startActionId: "bitbucket.run_pipeline",
      statusActionId: "bitbucket.get_pipeline",
      cancelActionId: "bitbucket.stop_pipeline",
    },
    inputSchema: s.object("Input parameters for getting a Bitbucket pipeline.", {
      ...repositoryFields,
      pipelineUuid: s.nonEmptyString("The pipeline UUID."),
    }),
    outputSchema: pipelineSchema,
  }),
  defineProviderAction(service, {
    name: "run_pipeline",
    description: "Trigger a Bitbucket Pipelines run for a branch, tag, or commit.",
    requiredScopes: [bitbucketScopes.pipelineRun],
    asyncLifecycle: {
      startActionId: "bitbucket.run_pipeline",
      statusActionId: "bitbucket.get_pipeline",
      cancelActionId: "bitbucket.stop_pipeline",
    },

    inputSchema: s.object(
      "Input parameters for triggering a Bitbucket pipeline.",
      {
        ...repositoryFields,
        refType: s.stringEnum("The target reference type.", ["branch", "tag", "commit"]),
        refName: s.nonEmptyString("The branch or tag name. Required for branch and tag targets."),
        commitHash: s.nonEmptyString("The commit hash. Required for commit targets."),
        selectorType: s.literal("custom", {
          description: "The custom pipeline selector type. Must be provided together with selectorPattern.",
        }),
        selectorPattern: s.nonEmptyString(
          "The custom pipeline selector pattern. Must be provided together with selectorType.",
        ),
        variables: s.array(
          "Variables supplied only to this pipeline run.",
          s.object(
            "A pipeline variable supplied to the run.",
            {
              key: s.nonEmptyString("The variable key."),
              value: s.string("The variable value."),
              secured: s.boolean("Whether the variable should be secured."),
            },
            { optional: ["secured"] },
          ),
        ),
      },
      { optional: ["refName", "commitHash", "selectorType", "selectorPattern", "variables"] },
    ),
    outputSchema: pipelineSchema,
  }),
  defineProviderAction(service, {
    name: "stop_pipeline",
    description: "Stop a running Bitbucket pipeline.",
    requiredScopes: [bitbucketScopes.pipelineWrite],
    inputSchema: s.object("Input parameters for stopping a Bitbucket pipeline.", {
      ...repositoryFields,
      pipelineUuid: s.nonEmptyString("The pipeline UUID."),
    }),
    outputSchema: s.object("Pipeline stop acknowledgement.", {
      ok: s.boolean("Whether Bitbucket accepted the request to stop the pipeline."),
    }),
  }),
  listAction({
    name: "list_pipeline_variables",
    description: "List repository-level Bitbucket Pipelines variables.",
    scope: bitbucketScopes.pipelineRead,
    collection: "variables",
    itemSchema: variableSchema,
    fields: repositoryFields,
    required: ["workspace", "repository"],
  }),
  defineProviderAction(service, {
    name: "create_pipeline_variable",
    description: "Create a repository-level Bitbucket Pipelines variable.",
    requiredScopes: [bitbucketScopes.pipelineVariableWrite],

    inputSchema: s.object(
      "Input parameters for creating a repository pipeline variable.",
      {
        ...repositoryFields,
        key: s.nonEmptyString("The variable key."),
        value: s.string("The variable value."),
        secured: s.boolean("Whether the variable should be secured."),
      },
      { optional: ["secured"] },
    ),
    outputSchema: variableSchema,
  }),
  defineProviderAction(service, {
    name: "update_pipeline_variable",
    description: "Replace a repository-level Bitbucket Pipelines variable.",
    requiredScopes: [bitbucketScopes.pipelineVariableWrite],

    inputSchema: s.object(
      "Input parameters for updating a repository pipeline variable.",
      {
        ...repositoryFields,
        variableUuid: s.nonEmptyString("The variable UUID."),
        key: s.nonEmptyString("The replacement variable key."),
        value: s.string("The replacement variable value."),
        secured: s.boolean("Whether the variable should be secured."),
      },
      { optional: ["secured"] },
    ),
    outputSchema: variableSchema,
  }),
  defineProviderAction(service, {
    name: "delete_pipeline_variable",
    description: "Delete a repository-level Bitbucket Pipelines variable.",
    requiredScopes: [bitbucketScopes.pipelineVariableWrite],
    inputSchema: s.object("Input parameters for deleting a repository pipeline variable.", {
      ...repositoryFields,
      variableUuid: s.nonEmptyString("The variable UUID."),
    }),
    outputSchema: s.object("Pipeline variable deletion acknowledgement.", {
      ok: s.boolean("Whether Bitbucket accepted the pipeline variable deletion."),
    }),
  }),
  listAction({
    name: "list_repository_runners",
    description: "List Pipelines runners configured for a Bitbucket repository.",
    scope: bitbucketScopes.runnerRead,
    collection: "runners",
    itemSchema: bitbucketObject("A Bitbucket Pipelines runner record."),
    fields: repositoryFields,
    required: ["workspace", "repository"],
  }),
] as const satisfies ActionDefinition[];
