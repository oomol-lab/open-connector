import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gitea";

const pageField = s.positiveInteger("Page number of results to return.");
const limitField = s.positiveInteger("Maximum number of results to return.");
const repositoryOwnerField = s.nonEmptyString("Owner of the repository.");
const repositoryNameField = s.nonEmptyString("Name of the repository.");
const issueNumberField = s.positiveInteger("Issue number within the repository.");
const isoDateTimeField = s.string("Timestamp in ISO 8601 / RFC 3339 format.");
const looseObjectSchema = s.looseObject("A Gitea API object.");

const giteaUserSchema = s.looseObject(
  {
    id: s.integer("Numeric user ID."),
    login: s.string("Username of the Gitea account."),
    full_name: s.string("Full display name of the user."),
    email: s.string("Email address of the user when visible."),
    avatar_url: s.string("Avatar URL of the user."),
    html_url: s.string("HTML URL of the user profile."),
    language: s.string("Preferred language of the user."),
    location: s.string("Profile location of the user."),
    website: s.string("Website configured on the user profile."),
    description: s.string("Profile description or bio of the user."),
    visibility: s.string("Visibility setting of the user profile."),
    is_admin: s.boolean("Whether the user is a site administrator."),
    restricted: s.boolean("Whether the user account is restricted."),
    active: s.boolean("Whether the user account is active."),
    created: isoDateTimeField,
    last_login: isoDateTimeField,
  },
  { description: "A Gitea user record." },
);

const giteaLabelSchema = s.looseObject(
  {
    id: s.integer("Numeric label ID."),
    name: s.string("Label name."),
    color: s.string("Hex color value configured for the label."),
    description: s.nullableString("Description configured for the label."),
    exclusive: s.boolean("Whether the label is exclusive."),
    is_archived: s.boolean("Whether the label is archived."),
  },
  { description: "A Gitea issue label." },
);

const giteaMilestoneSchema = s.looseObject(
  {
    id: s.integer("Numeric milestone ID."),
    title: s.string("Milestone title."),
    state: s.string("Current milestone state."),
    description: s.nullableString("Milestone description."),
    due_on: s.nullableString("Due date of the milestone."),
    closed_at: s.nullableString("Timestamp when the milestone was closed."),
  },
  { description: "A Gitea milestone." },
);

const giteaRepositoryMetaSchema = s.looseObject(
  {
    id: s.integer("Numeric repository ID."),
    name: s.string("Repository name."),
    owner: s.string("Repository owner name."),
    full_name: s.string("Full repository name including owner."),
  },
  { description: "A compact Gitea repository record." },
);

const giteaRepositorySchema = s.looseObject(
  {
    id: s.integer("Numeric repository ID."),
    name: s.string("Repository name."),
    full_name: s.string("Full repository name including owner."),
    private: s.boolean("Whether the repository is private."),
    html_url: s.string("HTML URL of the repository."),
    clone_url: s.string("HTTPS clone URL of the repository."),
    ssh_url: s.string("SSH clone URL of the repository."),
    description: s.nullableString("Repository description."),
    default_branch: s.string("Default branch of the repository."),
    owner: giteaUserSchema,
    fork: s.boolean("Whether the repository is a fork."),
    mirror: s.boolean("Whether the repository is a mirror."),
    archived: s.boolean("Whether the repository is archived."),
    empty: s.boolean("Whether the repository is empty."),
    has_issues: s.boolean("Whether issues are enabled."),
    has_pull_requests: s.boolean("Whether pull requests are enabled."),
    has_projects: s.boolean("Whether projects are enabled."),
    has_wiki: s.boolean("Whether wiki is enabled."),
    has_actions: s.boolean("Whether actions are enabled."),
    open_issues_count: s.integer("Open issue count."),
    stars_count: s.integer("Star count."),
    watchers_count: s.integer("Watcher count."),
    forks_count: s.integer("Fork count."),
    size: s.integer("Repository size in kilobytes."),
    language: s.string("Primary language of the repository."),
    topics: s.stringArray("Topics configured on the repository.", { itemDescription: "A repository topic." }),
    created_at: isoDateTimeField,
    updated_at: isoDateTimeField,
  },
  { description: "A Gitea repository record." },
);

const giteaIssueSchema = s.looseObject(
  {
    id: s.integer("Numeric issue ID."),
    number: s.integer("Issue number within the repository."),
    title: s.string("Issue title."),
    body: s.nullableString("Issue body."),
    state: s.string("Issue state."),
    html_url: s.string("HTML URL of the issue."),
    url: s.string("API URL of the issue."),
    comments: s.integer("Number of comments on the issue."),
    created_at: isoDateTimeField,
    updated_at: isoDateTimeField,
    closed_at: s.nullableString("Timestamp when the issue was closed."),
    due_date: s.nullableString("Issue due date."),
    ref: s.nullableString("Git reference associated with the issue."),
    is_locked: s.boolean("Whether the issue is locked."),
    user: giteaUserSchema,
    assignee: s.nullable(giteaUserSchema),
    assignees: s.array("Assignees of the issue.", giteaUserSchema),
    labels: s.array("Labels attached to the issue.", giteaLabelSchema),
    milestone: s.nullable(giteaMilestoneSchema),
    repository: giteaRepositoryMetaSchema,
    pull_request: looseObjectSchema,
  },
  { description: "A Gitea issue record." },
);

const giteaCommentSchema = s.looseObject(
  {
    id: s.integer("Numeric comment ID."),
    body: s.string("Comment body."),
    html_url: s.string("HTML URL of the comment."),
    issue_url: s.string("API URL of the parent issue."),
    pull_request_url: s.nullableString("API URL of the related pull request."),
    created_at: isoDateTimeField,
    updated_at: isoDateTimeField,
    user: giteaUserSchema,
    assets: s.array("Attachments included with the comment.", looseObjectSchema),
  },
  { description: "A Gitea issue comment." },
);

const repositoriesListSchema = s.actionOutput(
  {
    repositories: s.array("Repositories returned by the request.", giteaRepositorySchema),
    total_count: s.integer("Total number of matching repositories from the x-total-count header when available."),
  },
  "A paginated list of Gitea repositories.",
  ["repositories"],
);

const repositorySearchSchema = s.actionOutput(
  {
    ok: s.boolean("Whether the search request succeeded."),
    repositories: s.array("Repositories returned by the search.", giteaRepositorySchema),
    total_count: s.integer("Total number of matching repositories from the x-total-count header when available."),
  },
  "A Gitea repository search response.",
  ["ok", "repositories"],
);

const issuesListSchema = s.actionOutput(
  {
    issues: s.array("Issues returned by the request.", giteaIssueSchema),
    total_count: s.integer("Total number of matching issues from the x-total-count header when available."),
  },
  "A paginated list of Gitea issues.",
  ["issues"],
);

const commentsListSchema = s.actionOutput(
  {
    comments: s.array("Comments returned by the request.", giteaCommentSchema),
    total_count: s.integer("Total number of matching comments from the x-total-count header when available."),
  },
  "A list of Gitea issue comments.",
  ["comments"],
);

const giteaBranchRefSchema = s.looseObject(
  {
    label: s.string("Branch label including the repository owner."),
    ref: s.string("Branch reference name."),
    sha: s.string("Commit SHA the branch points to."),
    repo_id: s.integer("Numeric ID of the repository the branch belongs to."),
    repo_name: s.string("Full repository name the branch belongs to."),
    user_id: s.integer("Numeric ID of the repository owner."),
    user_name: s.string("Username of the repository owner."),
  },
  { description: "A Gitea pull request branch reference." },
);

const giteaPullRequestSchema = s.looseObject(
  {
    id: s.integer("Numeric pull request ID."),
    number: s.integer("Pull request number within the repository."),
    title: s.string("Pull request title."),
    body: s.nullableString("Pull request body."),
    state: s.string("Pull request state."),
    html_url: s.string("HTML URL of the pull request."),
    base: giteaBranchRefSchema,
    head: giteaBranchRefSchema,
    mergeable: s.boolean("Whether the pull request can be merged."),
    merged: s.boolean("Whether the pull request has been merged."),
    mergeable_state: s.string("Mergeable state of the pull request."),
    merge_commit_sha: s.nullableString("SHA of the merge commit when merged."),
    created_at: isoDateTimeField,
    updated_at: isoDateTimeField,
    closed_at: s.nullableString("Timestamp when the pull request was closed."),
    merged_at: s.nullableString("Timestamp when the pull request was merged."),
    user: giteaUserSchema,
    assignee: s.nullable(giteaUserSchema),
    assignees: s.array("Assignees of the pull request.", giteaUserSchema),
    labels: s.array("Labels attached to the pull request.", giteaLabelSchema),
    milestone: s.nullable(giteaMilestoneSchema),
    repository: giteaRepositoryMetaSchema,
  },
  { description: "A Gitea pull request record." },
);

const pullRequestsListSchema = s.actionOutput(
  {
    pull_requests: s.array("Pull requests returned by the request.", giteaPullRequestSchema),
    total_count: s.integer("Total number of matching pull requests from the x-total-count header when available."),
  },
  "A paginated list of Gitea pull requests.",
  ["pull_requests"],
);

const giteaChangedFileSchema = s.looseObject(
  {
    filename: s.string("Path of the changed file."),
    previous_filename: s.nullableString("Previous path of the file when renamed."),
    status: s.string("Status of the change (added, modified, deleted, renamed, etc.)."),
    additions: s.integer("Number of added lines."),
    deletions: s.integer("Number of deleted lines."),
    changes: s.integer("Total number of changed lines."),
    contents_url: s.string("API URL of the file contents."),
    raw_url: s.string("Raw download URL of the file."),
    html_url: s.string("HTML URL of the file diff."),
  },
  { description: "A file changed in a Gitea pull request." },
);

const pullRequestFilesListSchema = s.actionOutput(
  {
    files: s.array("Files changed by the pull request.", giteaChangedFileSchema),
    total_count: s.integer("Total number of changed files from the x-total-count header when available."),
  },
  "A list of files changed by a Gitea pull request.",
  ["files"],
);

const giteaPullReviewSchema = s.looseObject(
  {
    id: s.integer("Numeric review ID."),
    body: s.string("Review body."),
    state: s.stringEnum("Review state.", ["APPROVED", "PENDING", "COMMENT", "REQUEST_CHANGES", "REQUEST_REVIEW"]),
    commit_id: s.string("Commit SHA the review is attached to."),
    official: s.boolean("Whether the review counts as an official review."),
    dismissed: s.boolean("Whether the review has been dismissed."),
    stale: s.boolean("Whether the review is stale."),
    comments_count: s.integer("Number of review comments."),
    html_url: s.string("HTML URL of the review."),
    pull_request_url: s.string("API URL of the pull request."),
    submitted_at: isoDateTimeField,
    updated_at: isoDateTimeField,
    user: giteaUserSchema,
  },
  { description: "A Gitea pull request review." },
);

const pullReviewsListSchema = s.actionOutput(
  {
    reviews: s.array("Reviews returned by the request.", giteaPullReviewSchema),
    total_count: s.integer("Total number of matching reviews from the x-total-count header when available."),
  },
  "A list of Gitea pull request reviews.",
  ["reviews"],
);

const giteaContentsResponseSchema = s.looseObject(
  {
    type: s.string("Entry type: file, dir, symlink or submodule."),
    encoding: s.nullableString("Content encoding, populated when type is file."),
    content: s.nullableString("File content, populated when type is file and encoded as base64."),
    size: s.integer("File size in bytes."),
    name: s.string("Entry name."),
    path: s.string("Full path of the entry."),
    sha: s.string("Git blob or tree SHA."),
    html_url: s.string("HTML URL of the entry."),
    git_url: s.string("Git API URL of the entry."),
    download_url: s.nullableString("Direct download URL of the entry."),
    url: s.string("API URL of the entry."),
    target: s.nullableString("Symlink target when type is symlink."),
    submodule_git_url: s.nullableString("Submodule git URL when type is submodule."),
    last_commit_sha: s.string("SHA of the last commit that affected this entry."),
  },
  { description: "A Gitea repository contents entry." },
);

const giteaCommitSchema = s.looseObject(
  {
    sha: s.string("Commit SHA."),
    message: s.string("Commit message."),
    url: s.string("API URL of the commit."),
    html_url: s.string("HTML URL of the commit."),
    author: s.looseObject("Commit author.", {
      name: s.string("Author name."),
      email: s.string("Author email."),
      date: isoDateTimeField,
    }),
    committer: s.looseObject("Commit committer.", {
      name: s.string("Committer name."),
      email: s.string("Committer email."),
      date: isoDateTimeField,
    }),
  },
  { description: "A Gitea commit created by a file operation." },
);

const giteaFileOperationResponseSchema = s.looseObject(
  {
    content: s.nullable(giteaContentsResponseSchema),
    commit: giteaCommitSchema,
  },
  { description: "Response of a Gitea file operation." },
);

const giteaMergeResponseSchema = s.actionOutput(
  {
    ok: s.boolean("Whether the merge request succeeded."),
  },
  "A Gitea pull request merge response.",
  ["ok"],
);

function repositoryInput(
  description: string,
  extra: Record<string, JsonSchema> = {},
  optional: string[] = [],
): JsonSchema {
  return s.object(
    description,
    {
      owner: repositoryOwnerField,
      repo: repositoryNameField,
      ...extra,
    },
    { optional },
  );
}

export const giteaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current authenticated Gitea user profile.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {}),
    outputSchema: giteaUserSchema,
    followUpActions: ["gitea.list_my_repositories"],
  }),
  defineProviderAction(service, {
    name: "list_my_repositories",
    description: "List repositories owned by the authenticated Gitea user.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: repositoriesListSchema,
    followUpActions: ["gitea.get_repository"],
  }),
  defineProviderAction(service, {
    name: "get_repository",
    description: "Get metadata for a Gitea repository by owner and name.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action."),
    outputSchema: giteaRepositorySchema,
    followUpActions: ["gitea.list_repository_issues"],
  }),
  defineProviderAction(service, {
    name: "search_repositories",
    description: "Search Gitea repositories by keyword with optional repository filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        query: s.nonEmptyString("Keyword used to search repositories."),
        topic: s.boolean("Whether to limit the keyword search to repository topics."),
        includeDescription: s.boolean("Whether the keyword should also search repository descriptions."),
        ownerId: s.positiveInteger("Only search repositories owned by or contributed to by this user ID."),
        priorityOwnerId: s.positiveInteger("Repository owner ID to prioritize in the results."),
        teamId: s.positiveInteger("Only search repositories that belong to this team ID."),
        starredByUserId: s.positiveInteger("Only search repositories starred by this user ID."),
        private: s.boolean("Whether private repositories accessible to the token should be included."),
        template: s.boolean("Whether template repositories accessible to the token should be included."),
        archived: s.boolean("Whether archived repositories should be included."),
        mode: s.stringEnum("Repository mode filter.", ["fork", "source", "mirror", "collaborative"]),
        exclusive: s.boolean("When ownerId is set, whether to restrict results to repositories the user owns."),
        sort: s.stringEnum("Sort field used by the repository search endpoint.", [
          "alpha",
          "created",
          "updated",
          "size",
          "git_size",
          "lfs_size",
          "stars",
          "forks",
          "id",
        ]),
        order: s.stringEnum("Sort order.", ["asc", "desc"]),
        page: pageField,
        limit: limitField,
      },
      {
        optional: [
          "topic",
          "includeDescription",
          "ownerId",
          "priorityOwnerId",
          "teamId",
          "starredByUserId",
          "private",
          "template",
          "archived",
          "mode",
          "exclusive",
          "sort",
          "order",
          "page",
          "limit",
        ],
      },
    ),
    outputSchema: repositorySearchSchema,
    followUpActions: ["gitea.get_repository"],
  }),
  defineProviderAction(service, {
    name: "list_repository_issues",
    description: "List issues in a Gitea repository. Pull requests are filtered out.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        state: s.stringEnum("Issue state filter.", ["open", "closed", "all"]),
        labels: s.array(
          "Label names or IDs used to filter issues.",
          s.union([s.nonEmptyString("A label name or ID."), s.integer("A label name or ID.")]),
        ),
        query: s.nonEmptyString("Search string used to filter issues."),
        milestones: s.array(
          "Milestone names or IDs used to filter issues.",
          s.union([s.nonEmptyString("A milestone name or ID."), s.integer("A milestone name or ID.")]),
        ),
        since: isoDateTimeField,
        before: isoDateTimeField,
        createdBy: s.nonEmptyString("Only return issues created by this username."),
        assignedBy: s.nonEmptyString("Only return issues assigned to this username."),
        mentionedBy: s.nonEmptyString("Only return issues mentioning this username."),
        page: pageField,
        limit: limitField,
      },
      [
        "state",
        "labels",
        "query",
        "milestones",
        "since",
        "before",
        "createdBy",
        "assignedBy",
        "mentionedBy",
        "page",
        "limit",
      ],
    ),
    outputSchema: issuesListSchema,
    followUpActions: ["gitea.get_issue", "gitea.create_issue"],
  }),
  defineProviderAction(service, {
    name: "get_issue",
    description: "Get a Gitea issue by repository and issue number.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      issueNumber: issueNumberField,
    }),
    outputSchema: giteaIssueSchema,
    followUpActions: ["gitea.list_issue_comments", "gitea.create_issue_comment"],
  }),
  defineProviderAction(service, {
    name: "create_issue",
    description: "Create an issue in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        title: s.nonEmptyString("Title of the issue."),
        body: s.string("Body of the issue."),
        assignees: s.stringArray("Usernames to assign to the issue.", { itemDescription: "An assignee username." }),
        labelIds: s.array("Label IDs to attach to the issue.", s.positiveInteger("A label ID.")),
        milestoneId: s.positiveInteger("Milestone ID to attach to the issue."),
        ref: s.nonEmptyString("Git reference associated with the issue."),
        dueDate: s.nonEmptyString("Issue deadline in RFC 3339 format. Gitea only uses the date component."),
        closed: s.boolean("Whether the issue should be created in the closed state."),
      },
      ["body", "assignees", "labelIds", "milestoneId", "ref", "dueDate", "closed"],
    ),
    outputSchema: giteaIssueSchema,
    followUpActions: ["gitea.create_issue_comment"],
  }),
  defineProviderAction(service, {
    name: "list_issue_comments",
    description: "List comments under a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        issueNumber: issueNumberField,
        since: isoDateTimeField,
        before: isoDateTimeField,
      },
      ["since", "before"],
    ),
    outputSchema: commentsListSchema,
    followUpActions: ["gitea.create_issue_comment"],
  }),
  defineProviderAction(service, {
    name: "create_issue_comment",
    description: "Create a comment on a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      issueNumber: issueNumberField,
      body: s.nonEmptyString("Comment body."),
    }),
    outputSchema: giteaCommentSchema,
  }),
  defineProviderAction(service, {
    name: "list_pull_requests",
    description: "List pull requests in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        state: s.stringEnum("Pull request state filter.", ["open", "closed", "all"]),
        baseBranch: s.nonEmptyString("Filter by the target base branch of the pull request."),
        sort: s.stringEnum("Sort type for the pull request list.", [
          "recentupdate",
          "leastupdate",
          "mostcomment",
          "leastcomment",
          "priority",
          "oldest",
          "newest",
        ]),
        milestone: s.positiveInteger("Milestone ID used to filter pull requests."),
        labels: s.array("Label IDs used to filter pull requests.", s.positiveInteger("A label ID.")),
        poster: s.nonEmptyString("Filter by the pull request author username."),
        page: pageField,
        limit: limitField,
      },
      ["state", "baseBranch", "sort", "milestone", "labels", "poster", "page", "limit"],
    ),
    outputSchema: pullRequestsListSchema,
    followUpActions: ["gitea.get_pull_request", "gitea.create_pull_request"],
  }),
  defineProviderAction(service, {
    name: "get_pull_request",
    description: "Get a Gitea pull request by repository and pull request number.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
    }),
    outputSchema: giteaPullRequestSchema,
    followUpActions: ["gitea.list_pull_request_files", "gitea.list_pull_request_reviews"],
  }),
  defineProviderAction(service, {
    name: "create_pull_request",
    description: "Create a pull request in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        title: s.nonEmptyString("Title of the pull request."),
        body: s.string("Body of the pull request."),
        base: s.nonEmptyString("The base branch the pull request targets."),
        head: s.nonEmptyString(
          "The head branch to merge from. Use branch name, or owner:branch for cross-repository pull requests.",
        ),
        assignees: s.stringArray("Usernames to assign to the pull request.", {
          itemDescription: "An assignee username.",
        }),
        labelIds: s.array("Label IDs to attach to the pull request.", s.positiveInteger("A label ID.")),
        milestoneId: s.positiveInteger("Milestone ID to attach to the pull request."),
        reviewers: s.stringArray("Usernames to request review from.", { itemDescription: "A reviewer username." }),
        teamReviewers: s.stringArray("Team names to request review from.", {
          itemDescription: "A team reviewer name.",
        }),
        allowMaintainerEdit: s.boolean("Whether maintainers can edit the pull request."),
        dueDate: s.nonEmptyString("Pull request deadline in RFC 3339 format. Gitea only uses the date component."),
      },
      ["body", "assignees", "labelIds", "milestoneId", "reviewers", "teamReviewers", "allowMaintainerEdit", "dueDate"],
    ),
    outputSchema: giteaPullRequestSchema,
    followUpActions: ["gitea.get_pull_request", "gitea.list_pull_request_files"],
  }),
  defineProviderAction(service, {
    name: "update_pull_request",
    description: "Update a Gitea pull request title, body, state, base branch, or review assignments.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        title: s.string("New title of the pull request."),
        body: s.string("New body of the pull request."),
        state: s.stringEnum("New state of the pull request.", ["open", "closed"]),
        base: s.string("New base branch the pull request targets."),
        assignees: s.stringArray("New list of assignee usernames.", { itemDescription: "An assignee username." }),
        labelIds: s.array("New list of label IDs.", s.positiveInteger("A label ID.")),
        milestoneId: s.positiveInteger("New milestone ID."),
        allowMaintainerEdit: s.boolean("Whether maintainers can edit the pull request."),
        unsetDueDate: s.boolean("Whether to remove the current deadline."),
        dueDate: s.nonEmptyString("New deadline in RFC 3339 format. Gitea only uses the date component."),
      },
      [
        "title",
        "body",
        "state",
        "base",
        "assignees",
        "labelIds",
        "milestoneId",
        "allowMaintainerEdit",
        "unsetDueDate",
        "dueDate",
      ],
    ),
    outputSchema: giteaPullRequestSchema,
    followUpActions: ["gitea.get_pull_request", "gitea.merge_pull_request"],
  }),
  defineProviderAction(service, {
    name: "merge_pull_request",
    description: "Merge a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        do: s.stringEnum("Merge style to use.", [
          "merge",
          "rebase",
          "rebase-merge",
          "squash",
          "fast-forward-only",
          "manually-merged",
        ]),
        mergeTitle: s.string("Title of the merge commit."),
        mergeMessage: s.string("Message of the merge commit."),
        deleteBranchAfterMerge: s.boolean("Whether to delete the head branch after merging."),
        forceMerge: s.boolean("Whether to merge even if checks do not pass."),
        mergeWhenChecksSucceed: s.boolean("Whether to merge automatically when checks succeed."),
        headCommitId: s.string("Commit ID of the head branch when force merging or merging manually."),
      },
      ["mergeTitle", "mergeMessage", "deleteBranchAfterMerge", "forceMerge", "mergeWhenChecksSucceed", "headCommitId"],
    ),
    outputSchema: giteaMergeResponseSchema,
    followUpActions: ["gitea.get_pull_request"],
  }),
  defineProviderAction(service, {
    name: "list_pull_request_files",
    description: "List files changed by a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
      page: pageField,
      limit: limitField,
    }),
    outputSchema: pullRequestFilesListSchema,
    followUpActions: ["gitea.get_repository_contents"],
  }),
  defineProviderAction(service, {
    name: "list_pull_request_reviews",
    description: "List reviews for a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
      page: pageField,
      limit: limitField,
    }),
    outputSchema: pullReviewsListSchema,
    followUpActions: ["gitea.create_pull_request_review", "gitea.submit_pull_request_review"],
  }),
  defineProviderAction(service, {
    name: "create_pull_request_review",
    description: "Create a review for a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        body: s.string("Review body."),
        event: s.stringEnum("Review event.", ["APPROVED", "PENDING", "COMMENT", "REQUEST_CHANGES", "REQUEST_REVIEW"]),
        commitId: s.string("Commit SHA the review is attached to."),
      },
      ["body", "event", "commitId"],
    ),
    outputSchema: giteaPullReviewSchema,
    followUpActions: ["gitea.submit_pull_request_review"],
  }),
  defineProviderAction(service, {
    name: "submit_pull_request_review",
    description: "Submit a pending Gitea pull request review.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
      reviewId: s.positiveInteger("ID of the review to submit."),
      body: s.string("Review body."),
      event: s.stringEnum("Review event.", ["APPROVED", "PENDING", "COMMENT", "REQUEST_CHANGES", "REQUEST_REVIEW"]),
    }),
    outputSchema: giteaPullReviewSchema,
  }),
  defineProviderAction(service, {
    name: "get_repository_contents",
    description: "Get the contents or metadata of a file or directory in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        filePath: s.nonEmptyString("Path of the file, directory, symlink or submodule in the repository."),
        ref: s.string("The name of the commit, branch or tag. Defaults to the repository default branch."),
      },
      ["ref"],
    ),
    outputSchema: giteaContentsResponseSchema,
    followUpActions: ["gitea.create_pull_request", "gitea.create_file"],
  }),
  defineProviderAction(service, {
    name: "create_file",
    description: "Create a file in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        filePath: s.nonEmptyString("Path of the file to create."),
        content: s.nonEmptyString("Content of the file. It is base64 encoded automatically before sending."),
        message: s.string("Commit message for the change."),
        branch: s.string("Base branch for the change. Defaults to the repository default branch."),
        newBranch: s.string("Create the commit on a new branch based on the base branch."),
        authorName: s.string("Author name for the commit."),
        authorEmail: s.string("Author email for the commit."),
        committerName: s.string("Committer name for the commit."),
        committerEmail: s.string("Committer email for the commit."),
        signoff: s.boolean("Add a Signed-off-by trailer to the commit."),
        forcePush: s.boolean("Force-push if the new branch already exists."),
      },
      [
        "message",
        "branch",
        "newBranch",
        "authorName",
        "authorEmail",
        "committerName",
        "committerEmail",
        "signoff",
        "forcePush",
      ],
    ),
    outputSchema: giteaFileOperationResponseSchema,
    followUpActions: ["gitea.get_repository_contents", "gitea.create_pull_request"],
  }),
  defineProviderAction(service, {
    name: "update_file",
    description: "Update or create a file in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        filePath: s.nonEmptyString("Path of the file to update."),
        content: s.nonEmptyString("New content of the file. It is base64 encoded automatically before sending."),
        sha: s.string("Blob SHA of the existing file to update. Omit to create a new file."),
        message: s.string("Commit message for the change."),
        branch: s.string("Base branch for the change. Defaults to the repository default branch."),
        newBranch: s.string("Create the commit on a new branch based on the base branch."),
        fromPath: s.string("Path of the original file when moving or renaming a file."),
        authorName: s.string("Author name for the commit."),
        authorEmail: s.string("Author email for the commit."),
        committerName: s.string("Committer name for the commit."),
        committerEmail: s.string("Committer email for the commit."),
        signoff: s.boolean("Add a Signed-off-by trailer to the commit."),
        forcePush: s.boolean("Force-push if the new branch already exists."),
      },
      [
        "sha",
        "message",
        "branch",
        "newBranch",
        "fromPath",
        "authorName",
        "authorEmail",
        "committerName",
        "committerEmail",
        "signoff",
        "forcePush",
      ],
    ),
    outputSchema: giteaFileOperationResponseSchema,
    followUpActions: ["gitea.get_repository_contents", "gitea.create_pull_request"],
  }),
  defineProviderAction(service, {
    name: "delete_file",
    description: "Delete a file from a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        filePath: s.nonEmptyString("Path of the file to delete."),
        sha: s.nonEmptyString("Blob SHA of the file to delete."),
        message: s.string("Commit message for the change."),
        branch: s.string("Base branch for the change. Defaults to the repository default branch."),
        newBranch: s.string("Create the commit on a new branch based on the base branch."),
        authorName: s.string("Author name for the commit."),
        authorEmail: s.string("Author email for the commit."),
        committerName: s.string("Committer name for the commit."),
        committerEmail: s.string("Committer email for the commit."),
        signoff: s.boolean("Add a Signed-off-by trailer to the commit."),
      },
      ["message", "branch", "newBranch", "authorName", "authorEmail", "committerName", "committerEmail", "signoff"],
    ),
    outputSchema: giteaFileOperationResponseSchema,
    followUpActions: ["gitea.get_repository_contents"],
  }),
];

export type GiteaActionName =
  | "get_current_user"
  | "list_my_repositories"
  | "get_repository"
  | "search_repositories"
  | "list_repository_issues"
  | "get_issue"
  | "create_issue"
  | "list_issue_comments"
  | "create_issue_comment"
  | "list_pull_requests"
  | "get_pull_request"
  | "create_pull_request"
  | "update_pull_request"
  | "merge_pull_request"
  | "list_pull_request_files"
  | "list_pull_request_reviews"
  | "create_pull_request_review"
  | "submit_pull_request_review"
  | "get_repository_contents"
  | "create_file"
  | "update_file"
  | "delete_file";
