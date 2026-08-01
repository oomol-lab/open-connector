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

const giteaContentsEntrySchema = s.looseObject(
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

const giteaContentsResponseSchema = s.union(
  [
    giteaContentsEntrySchema,
    s.array("Directory entries returned when filePath points to a directory.", giteaContentsEntrySchema),
  ],
  {
    description:
      "A Gitea repository contents response: a single entry for a file, or an array of entries for a directory.",
  },
);

const giteaCommitIdentitySchema = s.looseObject(
  {
    name: s.string("Name recorded on the commit."),
    email: s.string("Email recorded on the commit."),
    date: isoDateTimeField,
  },
  { description: "A git identity recorded on a commit." },
);

const giteaCommitSchema = s.looseObject(
  {
    sha: s.string("Commit SHA."),
    message: s.string("Commit message."),
    url: s.string("API URL of the commit."),
    html_url: s.string("HTML URL of the commit."),
    created: isoDateTimeField,
    author: giteaCommitIdentitySchema,
    committer: giteaCommitIdentitySchema,
    parents: s.array("Parent commits of this commit.", looseObjectSchema),
  },
  { description: "A Gitea commit created by a file operation." },
);

const giteaFileOperationResponseSchema = s.looseObject(
  {
    content: s.nullable(giteaContentsEntrySchema),
    commit: giteaCommitSchema,
  },
  { description: "Response of a Gitea file operation." },
);

const giteaMergeResponseSchema = s.actionOutput(
  {
    ok: s.boolean("Whether the merge request succeeded."),
    response: looseObjectSchema,
  },
  "A Gitea pull request merge response.",
  ["ok"],
);

const giteaBranchSchema = s.looseObject(
  {
    name: s.string("Branch name."),
    protected: s.boolean("Whether the branch is protected."),
    user_can_push: s.boolean("Whether the current user can push to the branch."),
    user_can_merge: s.boolean("Whether the current user can merge to the branch."),
    effective_branch_protection_name: s.nullableString("Name of the effective branch protection rule."),
    commit: looseObjectSchema,
  },
  { description: "A Gitea branch." },
);

const giteaCommitRecordSchema = s.looseObject(
  {
    sha: s.string("Commit SHA."),
    url: s.string("API URL of the commit."),
    html_url: s.string("HTML URL of the commit."),
    created: isoDateTimeField,
    commit: s.looseObject(
      {
        url: s.string("API URL of the git commit object."),
        message: s.string("Commit message."),
        author: giteaCommitIdentitySchema,
        committer: giteaCommitIdentitySchema,
        tree: looseObjectSchema,
        verification: looseObjectSchema,
      },
      { description: "Git metadata of the commit." },
    ),
    author: s.nullable(giteaUserSchema),
    committer: s.nullable(giteaUserSchema),
    parents: s.array("Parent commits of this commit.", looseObjectSchema),
    files: s.array("Files touched by the commit when requested.", looseObjectSchema),
    stats: looseObjectSchema,
  },
  { description: "A Gitea commit record." },
);

const giteaTagSchema = s.looseObject(
  {
    id: s.string("ID of the tag object."),
    name: s.string("Tag name."),
    message: s.nullableString("Annotated tag message."),
    commit: s.looseObject("Commit the tag points to.", {
      id: s.string("Commit SHA."),
      message: s.string("Commit message."),
      url: s.string("API URL of the commit."),
    }),
    tarball_url: s.string("Tarball download URL."),
    zipball_url: s.string("Zipball download URL."),
  },
  { description: "A Gitea tag." },
);

const giteaReleaseSchema = s.looseObject(
  {
    id: s.integer("Numeric release ID."),
    tag_name: s.string("Git tag associated with the release."),
    name: s.string("Release title."),
    body: s.nullableString("Release notes."),
    draft: s.boolean("Whether the release is a draft."),
    prerelease: s.boolean("Whether the release is a prerelease."),
    target_commitish: s.string("Target commitish of the release."),
    html_url: s.string("HTML URL of the release."),
    url: s.string("API URL of the release."),
    tarball_url: s.string("Tarball download URL."),
    zipball_url: s.string("Zipball download URL."),
    created_at: isoDateTimeField,
    published_at: s.nullableString("Timestamp when the release was published."),
    author: giteaUserSchema,
    assets: s.array("Files attached to the release.", looseObjectSchema),
  },
  { description: "A Gitea release." },
);

const giteaHookSchema = s.looseObject(
  {
    id: s.integer("Numeric hook ID."),
    type: s.string("Hook type (gitea, slack, discord, etc.)."),
    name: s.nullableString("Human-readable hook name."),
    active: s.boolean("Whether the hook is active."),
    events: s.stringArray("Events that trigger the hook.", { itemDescription: "A webhook event name." }),
    config: looseObjectSchema,
    branch_filter: s.nullableString("Branch filter pattern of the hook."),
    authorization_header: s.nullableString("Authorization header included in hook requests."),
    created_at: isoDateTimeField,
    updated_at: isoDateTimeField,
  },
  { description: "A Gitea repository webhook." },
);

const giteaOrganizationSchema = s.looseObject(
  {
    id: s.integer("Numeric organization ID."),
    name: s.string("Organization name."),
    username: s.string("Organization username."),
    full_name: s.string("Full display name of the organization."),
    description: s.nullableString("Organization description."),
    website: s.nullableString("Website URL of the organization."),
    location: s.nullableString("Location of the organization."),
    email: s.nullableString("Email address of the organization."),
    avatar_url: s.string("Avatar URL of the organization."),
    visibility: s.string("Visibility level of the organization."),
  },
  { description: "A Gitea organization." },
);

const giteaDeployKeySchema = s.looseObject(
  {
    id: s.integer("Numeric deploy key ID."),
    key: s.string("SSH public key content."),
    title: s.string("Key title."),
    read_only: s.boolean("Whether the key is read-only."),
    fingerprint: s.string("Key fingerprint."),
    url: s.string("API URL of the deploy key."),
    created_at: isoDateTimeField,
  },
  { description: "A Gitea repository deploy key." },
);

const giteaCommitStatusSchema = s.looseObject(
  {
    id: s.integer("Numeric status ID."),
    context: s.string("Status context."),
    description: s.nullableString("Status description."),
    state: s.stringEnum("Status state.", ["pending", "success", "error", "failure", "warning", "skipped"]),
    target_url: s.nullableString("URL with more details about the status."),
    url: s.string("API URL of the status."),
    created_at: isoDateTimeField,
    updated_at: isoDateTimeField,
    creator: giteaUserSchema,
  },
  { description: "A Gitea commit status." },
);

const giteaPullReviewCommentSchema = s.looseObject(
  {
    id: s.integer("Numeric comment ID."),
    body: s.string("Comment body."),
    path: s.string("File path the comment is attached to."),
    position: s.integer("Line position in the current diff."),
    original_position: s.integer("Line position in the original diff."),
    commit_id: s.string("Commit SHA the comment is attached to."),
    original_commit_id: s.string("Original commit SHA the comment was created against."),
    diff_hunk: s.string("Diff hunk context of the comment."),
    html_url: s.string("HTML URL of the comment."),
    pull_request_url: s.string("API URL of the pull request."),
    pull_request_review_id: s.integer("Numeric review ID the comment belongs to."),
    created_at: isoDateTimeField,
    updated_at: isoDateTimeField,
    user: giteaUserSchema,
  },
  { description: "A Gitea pull request review comment." },
);

const giteaPermissionSchema = s.looseObject(
  {
    admin: s.boolean("Whether the user has admin access."),
    pull: s.boolean("Whether the user has pull access."),
    push: s.boolean("Whether the user has push access."),
  },
  { description: "Permission levels of a collaborator." },
);

const giteaCollaboratorPermissionSchema = s.looseObject(
  {
    permission: giteaPermissionSchema,
    role_name: s.string("Role name of the collaborator."),
    user: giteaUserSchema,
  },
  { description: "Permission details of a Gitea collaborator." },
);

const branchesListSchema = s.actionOutput(
  {
    branches: s.array("Branches returned by the request.", giteaBranchSchema),
    total_count: s.integer("Total number of matching branches from the x-total-count header when available."),
  },
  "A list of Gitea branches.",
  ["branches"],
);

const commitsListSchema = s.actionOutput(
  {
    commits: s.array("Commits returned by the request.", giteaCommitRecordSchema),
    total_count: s.integer("Total number of matching commits from the x-total-count header when available."),
  },
  "A list of Gitea commits.",
  ["commits"],
);

const tagsListSchema = s.actionOutput(
  {
    tags: s.array("Tags returned by the request.", giteaTagSchema),
    total_count: s.integer("Total number of matching tags from the x-total-count header when available."),
  },
  "A list of Gitea tags.",
  ["tags"],
);

const releasesListSchema = s.actionOutput(
  {
    releases: s.array("Releases returned by the request.", giteaReleaseSchema),
    total_count: s.integer("Total number of matching releases from the x-total-count header when available."),
  },
  "A list of Gitea releases.",
  ["releases"],
);

const repositoryLabelsListSchema = s.actionOutput(
  {
    labels: s.array("Labels returned by the request.", giteaLabelSchema),
    total_count: s.integer("Total number of matching labels from the x-total-count header when available."),
  },
  "A list of Gitea repository labels.",
  ["labels"],
);

const milestonesListSchema = s.actionOutput(
  {
    milestones: s.array("Milestones returned by the request.", giteaMilestoneSchema),
    total_count: s.integer("Total number of matching milestones from the x-total-count header when available."),
  },
  "A list of Gitea milestones.",
  ["milestones"],
);

const hooksListSchema = s.actionOutput(
  {
    hooks: s.array("Webhooks returned by the request.", giteaHookSchema),
    total_count: s.integer("Total number of matching hooks from the x-total-count header when available."),
  },
  "A list of Gitea repository webhooks.",
  ["hooks"],
);

const collaboratorsListSchema = s.actionOutput(
  {
    collaborators: s.array("Collaborators returned by the request.", giteaUserSchema),
    total_count: s.integer("Total number of matching collaborators from the x-total-count header when available."),
  },
  "A list of Gitea repository collaborators.",
  ["collaborators"],
);

const organizationsListSchema = s.actionOutput(
  {
    organizations: s.array("Organizations returned by the request.", giteaOrganizationSchema),
    total_count: s.integer("Total number of matching organizations from the x-total-count header when available."),
  },
  "A list of Gitea organizations.",
  ["organizations"],
);

const organizationMembersListSchema = s.actionOutput(
  {
    members: s.array("Organization members returned by the request.", giteaUserSchema),
    total_count: s.integer("Total number of matching members from the x-total-count header when available."),
  },
  "A list of Gitea organization members.",
  ["members"],
);

const deployKeysListSchema = s.actionOutput(
  {
    keys: s.array("Deploy keys returned by the request.", giteaDeployKeySchema),
    total_count: s.integer("Total number of matching deploy keys from the x-total-count header when available."),
  },
  "A list of Gitea repository deploy keys.",
  ["keys"],
);

const commitStatusesListSchema = s.actionOutput(
  {
    statuses: s.array("Commit statuses returned by the request.", giteaCommitStatusSchema),
    total_count: s.integer("Total number of matching statuses from the x-total-count header when available."),
  },
  "A list of Gitea commit statuses.",
  ["statuses"],
);

const reviewCommentsListSchema = s.actionOutput(
  {
    comments: s.array("Review comments returned by the request.", giteaPullReviewCommentSchema),
    total_count: s.integer("Total number of matching comments from the x-total-count header when available."),
  },
  "A list of Gitea pull request review comments.",
  ["comments"],
);

const stargazersListSchema = s.actionOutput(
  {
    stargazers: s.array("Stargazers returned by the request.", giteaUserSchema),
    total_count: s.integer("Total number of matching stargazers from the x-total-count header when available."),
  },
  "A list of Gitea repository stargazers.",
  ["stargazers"],
);

const watchersListSchema = s.actionOutput(
  {
    watchers: s.array("Watchers returned by the request.", giteaUserSchema),
    total_count: s.integer("Total number of matching watchers from the x-total-count header when available."),
  },
  "A list of Gitea repository watchers.",
  ["watchers"],
);

const assigneesListSchema = s.actionOutput(
  {
    assignees: s.array("Assignees returned by the request.", giteaUserSchema),
    total_count: s.integer("Total number of matching assignees from the x-total-count header when available."),
  },
  "A list of Gitea repository assignees.",
  ["assignees"],
);

const repositoryTopicsSchema = s.actionOutput(
  {
    topics: s.stringArray("Topics of the repository.", { itemDescription: "A repository topic." }),
  },
  "The topics of a Gitea repository.",
  ["topics"],
);

const mergeCheckSchema = s.actionOutput(
  {
    merged: s.boolean("Whether the pull request has been merged."),
  },
  "Whether a Gitea pull request has been merged.",
  ["merged"],
);

const okResponseSchema = s.actionOutput(
  {
    ok: s.boolean("Whether the operation succeeded."),
  },
  "A Gitea operation result.",
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
          "oldest",
          "recentupdate",
          "recentclose",
          "leastupdate",
          "mostcomment",
          "leastcomment",
          "priority",
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
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: pullRequestFilesListSchema,
    followUpActions: ["gitea.get_repository_contents"],
  }),
  defineProviderAction(service, {
    name: "list_pull_request_reviews",
    description: "List reviews for a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
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
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        reviewId: s.positiveInteger("ID of the review to submit."),
        body: s.string("Review body."),
        event: s.stringEnum("Review event.", ["APPROVED", "PENDING", "COMMENT", "REQUEST_CHANGES", "REQUEST_REVIEW"]),
      },
      ["body", "event"],
    ),
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
  defineProviderAction(service, {
    name: "create_repository",
    description: "Create a repository for the authenticated Gitea user.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        name: s.nonEmptyString("Name of the repository to create."),
        description: s.string("Description of the repository."),
        private: s.boolean("Whether the repository should be private."),
        autoInit: s.boolean("Whether the repository should be auto-initialized with a README."),
        defaultBranch: s.nonEmptyString("Default branch to use when initializing the repository."),
        gitignores: s.string("Comma-separated list of gitignore templates to use."),
        license: s.string("License template to use."),
        readme: s.string("README template to use."),
        issueLabels: s.string("Label set to use for the repository."),
        template: s.boolean("Whether the repository should be a template repository."),
        objectFormatName: s.stringEnum("Git object format of the repository.", ["sha1", "sha256"]),
        trustModel: s.stringEnum("Trust model of the repository.", [
          "default",
          "collaborator",
          "committer",
          "collaboratorcommitter",
        ]),
      },
      {
        optional: [
          "description",
          "private",
          "autoInit",
          "defaultBranch",
          "gitignores",
          "license",
          "readme",
          "issueLabels",
          "template",
          "objectFormatName",
          "trustModel",
        ],
      },
    ),
    outputSchema: giteaRepositorySchema,
    followUpActions: ["gitea.get_repository", "gitea.create_file"],
  }),
  defineProviderAction(service, {
    name: "update_repository",
    description: "Update settings of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        name: s.string("New name of the repository."),
        description: s.string("New description of the repository."),
        website: s.string("A URL with more information about the repository."),
        private: s.boolean("Whether the repository should be private."),
        template: s.boolean("Whether the repository should be a template repository."),
        archived: s.boolean("Whether the repository should be archived."),
        defaultBranch: s.string("New default branch of the repository."),
        defaultMergeStyle: s.stringEnum("Default merge style of the repository.", [
          "merge",
          "rebase",
          "rebase-merge",
          "squash",
          "fast-forward-only",
        ]),
        defaultDeleteBranchAfterMerge: s.boolean("Whether to delete the pull request branch after merge by default."),
        defaultAllowMaintainerEdit: s.boolean("Whether maintainers can edit pull requests by default."),
        hasIssues: s.boolean("Whether the issues unit is enabled."),
        hasPullRequests: s.boolean("Whether the pull requests unit is enabled."),
        hasProjects: s.boolean("Whether the projects unit is enabled."),
        hasWiki: s.boolean("Whether the wiki unit is enabled."),
        hasActions: s.boolean("Whether the actions unit is enabled."),
        hasPackages: s.boolean("Whether the packages unit is enabled."),
        hasReleases: s.boolean("Whether the releases unit is enabled."),
        allowMergeCommits: s.boolean("Whether merging with merge commits is allowed."),
        allowRebase: s.boolean("Whether rebase merging is allowed."),
        allowRebaseExplicit: s.boolean("Whether rebase with explicit merge commits is allowed."),
        allowRebaseUpdate: s.boolean("Whether updating the pull request branch by rebase is allowed."),
        allowSquashMerge: s.boolean("Whether squash merging is allowed."),
        allowFastForwardOnlyMerge: s.boolean("Whether fast-forward-only merging is allowed."),
        allowManualMerge: s.boolean("Whether marking a pull request as merged manually is allowed."),
        autodetectManualMerge: s.boolean("Whether manual merge should be autodetected."),
        ignoreWhitespaceConflicts: s.boolean("Whether whitespace conflicts are ignored."),
        enablePrune: s.boolean("Whether to prune remote-tracking references when mirroring."),
        mirrorInterval: s.string("Mirror interval, for example 8h30m0s."),
      },
      [
        "name",
        "description",
        "website",
        "private",
        "template",
        "archived",
        "defaultBranch",
        "defaultMergeStyle",
        "defaultDeleteBranchAfterMerge",
        "defaultAllowMaintainerEdit",
        "hasIssues",
        "hasPullRequests",
        "hasProjects",
        "hasWiki",
        "hasActions",
        "hasPackages",
        "hasReleases",
        "allowMergeCommits",
        "allowRebase",
        "allowRebaseExplicit",
        "allowRebaseUpdate",
        "allowSquashMerge",
        "allowFastForwardOnlyMerge",
        "allowManualMerge",
        "autodetectManualMerge",
        "ignoreWhitespaceConflicts",
        "enablePrune",
        "mirrorInterval",
      ],
    ),
    outputSchema: giteaRepositorySchema,
    followUpActions: ["gitea.get_repository"],
  }),
  defineProviderAction(service, {
    name: "delete_repository",
    description: "Delete a Gitea repository permanently.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action."),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "fork_repository",
    description: "Fork a Gitea repository to the authenticated user or an organization.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        name: s.nonEmptyString("Name of the forked repository. Defaults to the original name."),
        organization: s.nonEmptyString("Organization name when forking into an organization."),
      },
      ["name", "organization"],
    ),
    outputSchema: giteaRepositorySchema,
    followUpActions: ["gitea.get_repository", "gitea.list_pull_requests"],
  }),
  defineProviderAction(service, {
    name: "list_repository_topics",
    description: "List topics of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action."),
    outputSchema: repositoryTopicsSchema,
    followUpActions: ["gitea.update_repository_topics"],
  }),
  defineProviderAction(service, {
    name: "update_repository_topics",
    description: "Replace all topics of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      topics: s.stringArray("New list of topics for the repository.", { itemDescription: "A repository topic." }),
    }),
    outputSchema: repositoryTopicsSchema,
    followUpActions: ["gitea.list_repository_topics"],
  }),
  defineProviderAction(service, {
    name: "list_branches",
    description: "List branches of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: branchesListSchema,
    followUpActions: ["gitea.get_branch", "gitea.create_branch"],
  }),
  defineProviderAction(service, {
    name: "get_branch",
    description: "Get a branch of a Gitea repository by name.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      branch: s.nonEmptyString("Name of the branch."),
    }),
    outputSchema: giteaBranchSchema,
    followUpActions: ["gitea.get_repository_contents"],
  }),
  defineProviderAction(service, {
    name: "create_branch",
    description: "Create a new branch in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        newBranchName: s.nonEmptyString("Name of the new branch to create."),
        oldRefName: s.nonEmptyString("Branch, tag or commit SHA the new branch is created from."),
      },
      ["oldRefName"],
    ),
    outputSchema: giteaBranchSchema,
    followUpActions: ["gitea.get_branch", "gitea.create_file"],
  }),
  defineProviderAction(service, {
    name: "delete_branch",
    description: "Delete a branch of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      branch: s.nonEmptyString("Name of the branch to delete."),
    }),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_commits",
    description: "List commits of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        sha: s.nonEmptyString("Branch, tag or commit SHA to list commits from."),
        path: s.nonEmptyString("Only list commits affecting this file path."),
        since: isoDateTimeField,
        until: isoDateTimeField,
        page: pageField,
        limit: limitField,
      },
      ["sha", "path", "since", "until", "page", "limit"],
    ),
    outputSchema: commitsListSchema,
    followUpActions: ["gitea.get_commit", "gitea.create_commit_status"],
  }),
  defineProviderAction(service, {
    name: "get_commit",
    description: "Get a commit of a Gitea repository by SHA.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      sha: s.nonEmptyString("Commit SHA to fetch."),
    }),
    outputSchema: giteaCommitRecordSchema,
    followUpActions: ["gitea.create_commit_status"],
  }),
  defineProviderAction(service, {
    name: "create_commit_status",
    description: "Create a commit status for a commit SHA in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        sha: s.nonEmptyString("Commit SHA to attach the status to."),
        state: s.stringEnum("Status state.", ["pending", "success", "error", "failure", "warning", "skipped"]),
        context: s.nonEmptyString("Unique context identifier for the status."),
        description: s.string("Short description of the status."),
        targetUrl: s.nonEmptyString("URL with more details about the status."),
      },
      ["context", "description", "targetUrl"],
    ),
    outputSchema: giteaCommitStatusSchema,
    followUpActions: ["gitea.list_commit_statuses"],
  }),
  defineProviderAction(service, {
    name: "list_commit_statuses",
    description: "List commit statuses for a commit SHA or ref in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        ref: s.nonEmptyString("Commit SHA or ref to list statuses for."),
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: commitStatusesListSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List tags of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: tagsListSchema,
    followUpActions: ["gitea.get_tag", "gitea.create_tag"],
  }),
  defineProviderAction(service, {
    name: "get_tag",
    description: "Get a tag of a Gitea repository by name.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      tag: s.nonEmptyString("Name of the tag."),
    }),
    outputSchema: giteaTagSchema,
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create a tag in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        tagName: s.nonEmptyString("Name of the tag to create."),
        target: s.nonEmptyString(
          "Commit SHA or branch name the tag points to. Defaults to the repository default branch.",
        ),
        message: s.string("Message of the annotated tag."),
      },
      ["target", "message"],
    ),
    outputSchema: giteaTagSchema,
    followUpActions: ["gitea.get_tag", "gitea.create_release"],
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete a tag from a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      tag: s.nonEmptyString("Name of the tag to delete."),
    }),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_releases",
    description: "List releases of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        draft: s.boolean("Whether to include draft releases."),
        prerelease: s.boolean("Whether to include prereleases."),
        page: pageField,
        limit: limitField,
      },
      ["draft", "prerelease", "page", "limit"],
    ),
    outputSchema: releasesListSchema,
    followUpActions: ["gitea.get_release", "gitea.create_release"],
  }),
  defineProviderAction(service, {
    name: "get_release",
    description: "Get a release of a Gitea repository by ID.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      releaseId: s.positiveInteger("Numeric ID of the release."),
    }),
    outputSchema: giteaReleaseSchema,
  }),
  defineProviderAction(service, {
    name: "create_release",
    description: "Create a release in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        tagName: s.nonEmptyString("Git tag associated with the release."),
        name: s.string("Display title of the release."),
        body: s.string("Release notes or description."),
        targetCommitish: s.nonEmptyString("Commit SHA or branch the release targets."),
        draft: s.boolean("Whether to create the release as a draft."),
        prerelease: s.boolean("Whether to mark the release as a prerelease."),
        tagMessage: s.string("Message of the git tag."),
      },
      ["name", "body", "targetCommitish", "draft", "prerelease", "tagMessage"],
    ),
    outputSchema: giteaReleaseSchema,
    followUpActions: ["gitea.get_release"],
  }),
  defineProviderAction(service, {
    name: "update_release",
    description: "Update a release of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        releaseId: s.positiveInteger("Numeric ID of the release."),
        tagName: s.string("New git tag associated with the release."),
        name: s.string("New display title of the release."),
        body: s.string("New release notes or description."),
        targetCommitish: s.string("New target commitish of the release."),
        draft: s.boolean("Whether the release should be a draft."),
        prerelease: s.boolean("Whether the release should be a prerelease."),
      },
      ["tagName", "name", "body", "targetCommitish", "draft", "prerelease"],
    ),
    outputSchema: giteaReleaseSchema,
    followUpActions: ["gitea.get_release"],
  }),
  defineProviderAction(service, {
    name: "delete_release",
    description: "Delete a release from a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      releaseId: s.positiveInteger("Numeric ID of the release to delete."),
    }),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_repository_labels",
    description: "List labels of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: repositoryLabelsListSchema,
    followUpActions: ["gitea.get_label", "gitea.create_label"],
  }),
  defineProviderAction(service, {
    name: "get_label",
    description: "Get a label of a Gitea repository by ID.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      labelId: s.positiveInteger("Numeric ID of the label."),
    }),
    outputSchema: giteaLabelSchema,
  }),
  defineProviderAction(service, {
    name: "create_label",
    description: "Create a label in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        name: s.nonEmptyString("Display name of the label."),
        color: s.nonEmptyString("Hex color of the label, for example #00aabb."),
        description: s.string("Description of the label."),
        exclusive: s.boolean("Whether the label is exclusive."),
        isArchived: s.boolean("Whether the label is archived."),
      },
      ["description", "exclusive", "isArchived"],
    ),
    outputSchema: giteaLabelSchema,
    followUpActions: ["gitea.list_repository_labels"],
  }),
  defineProviderAction(service, {
    name: "update_label",
    description: "Update a label of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        labelId: s.positiveInteger("Numeric ID of the label."),
        name: s.string("New display name of the label."),
        color: s.string("New hex color of the label, for example #00aabb."),
        description: s.string("New description of the label."),
        exclusive: s.boolean("Whether the label is exclusive."),
        isArchived: s.boolean("Whether the label is archived."),
      },
      ["name", "color", "description", "exclusive", "isArchived"],
    ),
    outputSchema: giteaLabelSchema,
  }),
  defineProviderAction(service, {
    name: "delete_label",
    description: "Delete a label from a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      labelId: s.positiveInteger("Numeric ID of the label to delete."),
    }),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_milestones",
    description: "List milestones of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        state: s.stringEnum("Milestone state filter.", ["open", "closed", "all"]),
        name: s.nonEmptyString("Filter milestones by name."),
        page: pageField,
        limit: limitField,
      },
      ["state", "name", "page", "limit"],
    ),
    outputSchema: milestonesListSchema,
    followUpActions: ["gitea.get_milestone", "gitea.create_milestone"],
  }),
  defineProviderAction(service, {
    name: "get_milestone",
    description: "Get a milestone of a Gitea repository by ID.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      milestoneId: s.positiveInteger("Numeric ID of the milestone."),
    }),
    outputSchema: giteaMilestoneSchema,
  }),
  defineProviderAction(service, {
    name: "create_milestone",
    description: "Create a milestone in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        title: s.nonEmptyString("Title of the milestone."),
        description: s.string("Description of the milestone."),
        state: s.stringEnum("Initial state of the milestone.", ["open", "closed"]),
        dueOn: s.nonEmptyString("Due date of the milestone in RFC 3339 format."),
      },
      ["description", "state", "dueOn"],
    ),
    outputSchema: giteaMilestoneSchema,
    followUpActions: ["gitea.list_milestones"],
  }),
  defineProviderAction(service, {
    name: "update_milestone",
    description: "Update a milestone of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        milestoneId: s.positiveInteger("Numeric ID of the milestone."),
        title: s.string("New title of the milestone."),
        description: s.string("New description of the milestone."),
        state: s.stringEnum("New state of the milestone.", ["open", "closed"]),
        dueOn: s.nonEmptyString("New due date of the milestone in RFC 3339 format."),
      },
      ["title", "description", "state", "dueOn"],
    ),
    outputSchema: giteaMilestoneSchema,
  }),
  defineProviderAction(service, {
    name: "delete_milestone",
    description: "Delete a milestone from a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      milestoneId: s.positiveInteger("Numeric ID of the milestone to delete."),
    }),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "update_issue",
    description: "Update an issue in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        issueNumber: issueNumberField,
        title: s.string("New title of the issue."),
        body: s.string("New body of the issue."),
        state: s.stringEnum("New state of the issue.", ["open", "closed"]),
        assignees: s.stringArray("New list of assignee usernames.", { itemDescription: "An assignee username." }),
        milestoneId: s.positiveInteger("New milestone ID."),
        ref: s.nonEmptyString("Git reference associated with the issue."),
        dueDate: s.nonEmptyString("New deadline in RFC 3339 format. Gitea only uses the date component."),
        unsetDueDate: s.boolean("Whether to remove the current deadline."),
      },
      ["title", "body", "state", "assignees", "milestoneId", "ref", "dueDate", "unsetDueDate"],
    ),
    outputSchema: giteaIssueSchema,
    followUpActions: ["gitea.get_issue", "gitea.create_issue_comment"],
  }),
  defineProviderAction(service, {
    name: "list_issue_labels",
    description: "List labels attached to a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      issueNumber: issueNumberField,
    }),
    outputSchema: repositoryLabelsListSchema,
    followUpActions: ["gitea.add_issue_labels"],
  }),
  defineProviderAction(service, {
    name: "add_issue_labels",
    description: "Add labels to a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        issueNumber: issueNumberField,
        labels: s.array("Label IDs to add to the issue.", s.positiveInteger("A label ID.")),
      },
      ["labels"],
    ),
    outputSchema: repositoryLabelsListSchema,
    followUpActions: ["gitea.list_issue_labels"],
  }),
  defineProviderAction(service, {
    name: "replace_issue_labels",
    description: "Replace all labels of a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        issueNumber: issueNumberField,
        labels: s.array("New list of label IDs for the issue.", s.positiveInteger("A label ID.")),
      },
      ["labels"],
    ),
    outputSchema: repositoryLabelsListSchema,
    followUpActions: ["gitea.list_issue_labels"],
  }),
  defineProviderAction(service, {
    name: "remove_issue_label",
    description: "Remove a label from a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      issueNumber: issueNumberField,
      labelId: s.positiveInteger("Numeric ID of the label to remove."),
    }),
    outputSchema: okResponseSchema,
    followUpActions: ["gitea.list_issue_labels"],
  }),
  defineProviderAction(service, {
    name: "clear_issue_labels",
    description: "Remove all labels from a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      issueNumber: issueNumberField,
    }),
    outputSchema: okResponseSchema,
    followUpActions: ["gitea.list_issue_labels"],
  }),
  defineProviderAction(service, {
    name: "update_issue_comment",
    description: "Update a comment on a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      commentId: s.positiveInteger("Numeric ID of the comment to update."),
      body: s.nonEmptyString("New body of the comment."),
    }),
    outputSchema: giteaCommentSchema,
    followUpActions: ["gitea.list_issue_comments"],
  }),
  defineProviderAction(service, {
    name: "delete_issue_comment",
    description: "Delete a comment from a Gitea issue.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      commentId: s.positiveInteger("Numeric ID of the comment to delete."),
    }),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_issue_assignees",
    description: "List users that can be assigned to issues in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action."),
    outputSchema: assigneesListSchema,
    followUpActions: ["gitea.create_issue", "gitea.update_issue"],
  }),
  defineProviderAction(service, {
    name: "list_pull_request_commits",
    description: "List commits of a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: commitsListSchema,
    followUpActions: ["gitea.create_commit_status"],
  }),
  defineProviderAction(service, {
    name: "check_pull_request_merged",
    description: "Check whether a Gitea pull request has been merged.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
    }),
    outputSchema: mergeCheckSchema,
    followUpActions: ["gitea.get_pull_request"],
  }),
  defineProviderAction(service, {
    name: "request_pull_request_reviewers",
    description: "Request reviews for a Gitea pull request from users or teams.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        reviewers: s.stringArray("Usernames to request review from.", { itemDescription: "A reviewer username." }),
        teamReviewers: s.stringArray("Team names to request review from.", {
          itemDescription: "A team reviewer name.",
        }),
      },
      ["reviewers", "teamReviewers"],
    ),
    outputSchema: pullReviewsListSchema,
    followUpActions: ["gitea.get_pull_request"],
  }),
  defineProviderAction(service, {
    name: "remove_pull_request_reviewers",
    description: "Remove requested reviewers from a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        reviewers: s.stringArray("Usernames to remove from the review request.", {
          itemDescription: "A reviewer username.",
        }),
        teamReviewers: s.stringArray("Team names to remove from the review request.", {
          itemDescription: "A team reviewer name.",
        }),
      },
      ["reviewers", "teamReviewers"],
    ),
    outputSchema: okResponseSchema,
    followUpActions: ["gitea.get_pull_request"],
  }),
  defineProviderAction(service, {
    name: "delete_pull_request_review",
    description: "Delete a review from a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
      reviewId: s.positiveInteger("ID of the review to delete."),
    }),
    outputSchema: okResponseSchema,
    followUpActions: ["gitea.list_pull_request_reviews"],
  }),
  defineProviderAction(service, {
    name: "dismiss_pull_request_review",
    description: "Dismiss a review on a Gitea pull request.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        reviewId: s.positiveInteger("ID of the review to dismiss."),
        message: s.nonEmptyString("Dismissal message shown to the review author."),
        priors: s.boolean("Whether previous reviews should be dismissed as well."),
      },
      ["priors"],
    ),
    outputSchema: giteaPullReviewSchema,
    followUpActions: ["gitea.list_pull_request_reviews"],
  }),
  defineProviderAction(service, {
    name: "list_pull_request_review_comments",
    description: "List review comments of a Gitea pull request review.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
      reviewId: s.positiveInteger("ID of the review to list comments for."),
    }),
    outputSchema: reviewCommentsListSchema,
    followUpActions: ["gitea.create_pull_request_review"],
  }),
  defineProviderAction(service, {
    name: "update_pull_request_branch",
    description: "Update the head branch of a Gitea pull request to the latest base branch.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        pullRequestNumber: s.positiveInteger("Pull request number within the repository."),
        style: s.stringEnum("Update style.", ["merge", "rebase"]),
      },
      ["style"],
    ),
    outputSchema: okResponseSchema,
    followUpActions: ["gitea.get_pull_request"],
  }),
  defineProviderAction(service, {
    name: "list_repository_hooks",
    description: "List webhooks of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: hooksListSchema,
    followUpActions: ["gitea.get_repository_hook", "gitea.create_repository_hook"],
  }),
  defineProviderAction(service, {
    name: "create_repository_hook",
    description: "Create a webhook in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        type: s.stringEnum("Hook type.", [
          "dingtalk",
          "discord",
          "gitea",
          "gogs",
          "msteams",
          "slack",
          "telegram",
          "feishu",
          "wechatwork",
          "packagist",
        ]),
        config: s.object(
          "Configuration of the hook.",
          {
            url: s.nonEmptyString("URL the hook sends requests to."),
            content_type: s.stringEnum("Content type of the request body.", ["json", "form"]),
            secret: s.string("Secret used to sign hook requests."),
            insecure_ssl: s.string("Whether to skip TLS verification. Use 'true' or 'false'."),
          },
          { optional: ["content_type", "secret", "insecure_ssl"] },
        ),
        events: s.stringArray("Events that trigger the hook.", { itemDescription: "A webhook event name." }),
        active: s.boolean("Whether the hook is active."),
        branchFilter: s.string("Branch filter pattern of the hook."),
        authorizationHeader: s.string("Authorization header to include in hook requests."),
      },
      ["events", "active", "branchFilter", "authorizationHeader"],
    ),
    outputSchema: giteaHookSchema,
    followUpActions: ["gitea.list_repository_hooks"],
  }),
  defineProviderAction(service, {
    name: "get_repository_hook",
    description: "Get a webhook of a Gitea repository by ID.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      hookId: s.positiveInteger("Numeric ID of the webhook."),
    }),
    outputSchema: giteaHookSchema,
  }),
  defineProviderAction(service, {
    name: "update_repository_hook",
    description: "Update a webhook of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        hookId: s.positiveInteger("Numeric ID of the webhook."),
        config: s.object(
          "Configuration of the hook.",
          {
            url: s.nonEmptyString("URL the hook sends requests to."),
            content_type: s.stringEnum("Content type of the request body.", ["json", "form"]),
            secret: s.string("Secret used to sign hook requests."),
            insecure_ssl: s.string("Whether to skip TLS verification. Use 'true' or 'false'."),
          },
          { optional: ["url", "content_type", "secret", "insecure_ssl"] },
        ),
        events: s.stringArray("Events that trigger the hook.", { itemDescription: "A webhook event name." }),
        active: s.boolean("Whether the hook is active."),
        branchFilter: s.string("Branch filter pattern of the hook."),
        authorizationHeader: s.string("Authorization header to include in hook requests."),
      },
      ["config", "events", "active", "branchFilter", "authorizationHeader"],
    ),
    outputSchema: giteaHookSchema,
    followUpActions: ["gitea.get_repository_hook"],
  }),
  defineProviderAction(service, {
    name: "delete_repository_hook",
    description: "Delete a webhook from a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      hookId: s.positiveInteger("Numeric ID of the webhook to delete."),
    }),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_collaborators",
    description: "List collaborators of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: collaboratorsListSchema,
    followUpActions: ["gitea.get_collaborator_permission"],
  }),
  defineProviderAction(service, {
    name: "add_collaborator",
    description: "Add a collaborator to a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        collaborator: s.nonEmptyString("Username of the collaborator to add."),
        permission: s.stringEnum("Permission level of the collaborator.", ["read", "write", "admin"]),
      },
      ["permission"],
    ),
    outputSchema: okResponseSchema,
    followUpActions: ["gitea.list_collaborators"],
  }),
  defineProviderAction(service, {
    name: "remove_collaborator",
    description: "Remove a collaborator from a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      collaborator: s.nonEmptyString("Username of the collaborator to remove."),
    }),
    outputSchema: okResponseSchema,
    followUpActions: ["gitea.list_collaborators"],
  }),
  defineProviderAction(service, {
    name: "get_collaborator_permission",
    description: "Get the permission level of a Gitea repository collaborator.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      collaborator: s.nonEmptyString("Username of the collaborator."),
    }),
    outputSchema: giteaCollaboratorPermissionSchema,
  }),
  defineProviderAction(service, {
    name: "list_my_organizations",
    description: "List organizations the authenticated Gitea user belongs to.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: organizationsListSchema,
    followUpActions: ["gitea.get_organization", "gitea.list_organization_repositories"],
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get a Gitea organization by name.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {
      org: s.nonEmptyString("Name of the organization."),
    }),
    outputSchema: giteaOrganizationSchema,
    followUpActions: ["gitea.list_organization_repositories", "gitea.list_organization_members"],
  }),
  defineProviderAction(service, {
    name: "list_organization_repositories",
    description: "List repositories of a Gitea organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        org: s.nonEmptyString("Name of the organization."),
        page: pageField,
        limit: limitField,
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: repositoriesListSchema,
    followUpActions: ["gitea.get_repository"],
  }),
  defineProviderAction(service, {
    name: "list_organization_members",
    description: "List members of a Gitea organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        org: s.nonEmptyString("Name of the organization."),
        page: pageField,
        limit: limitField,
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: organizationMembersListSchema,
    followUpActions: ["gitea.get_organization"],
  }),
  defineProviderAction(service, {
    name: "list_repository_stargazers",
    description: "List stargazers of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: stargazersListSchema,
  }),
  defineProviderAction(service, {
    name: "list_repository_watchers",
    description: "List watchers of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: watchersListSchema,
  }),
  defineProviderAction(service, {
    name: "star_repository",
    description: "Star a Gitea repository for the authenticated user.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action."),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "unstar_repository",
    description: "Remove a star from a Gitea repository for the authenticated user.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action."),
    outputSchema: okResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_repository_keys",
    description: "List deploy keys of a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        page: pageField,
        limit: limitField,
      },
      ["page", "limit"],
    ),
    outputSchema: deployKeysListSchema,
    followUpActions: ["gitea.get_repository_key", "gitea.create_repository_key"],
  }),
  defineProviderAction(service, {
    name: "create_repository_key",
    description: "Create a deploy key in a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput(
      "The input payload for this action.",
      {
        title: s.nonEmptyString("Title of the deploy key."),
        key: s.nonEmptyString("SSH public key content."),
        readOnly: s.boolean("Whether the key should be read-only."),
      },
      ["readOnly"],
    ),
    outputSchema: giteaDeployKeySchema,
    followUpActions: ["gitea.list_repository_keys"],
  }),
  defineProviderAction(service, {
    name: "get_repository_key",
    description: "Get a deploy key of a Gitea repository by ID.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      keyId: s.positiveInteger("Numeric ID of the deploy key."),
    }),
    outputSchema: giteaDeployKeySchema,
  }),
  defineProviderAction(service, {
    name: "delete_repository_key",
    description: "Delete a deploy key from a Gitea repository.",
    requiredScopes: [],
    inputSchema: repositoryInput("The input payload for this action.", {
      keyId: s.positiveInteger("Numeric ID of the deploy key to delete."),
    }),
    outputSchema: okResponseSchema,
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
  | "delete_file"
  | "create_repository"
  | "update_repository"
  | "delete_repository"
  | "fork_repository"
  | "list_repository_topics"
  | "update_repository_topics"
  | "list_branches"
  | "get_branch"
  | "create_branch"
  | "delete_branch"
  | "list_commits"
  | "get_commit"
  | "create_commit_status"
  | "list_commit_statuses"
  | "list_tags"
  | "get_tag"
  | "create_tag"
  | "delete_tag"
  | "list_releases"
  | "get_release"
  | "create_release"
  | "update_release"
  | "delete_release"
  | "list_repository_labels"
  | "get_label"
  | "create_label"
  | "update_label"
  | "delete_label"
  | "list_milestones"
  | "get_milestone"
  | "create_milestone"
  | "update_milestone"
  | "delete_milestone"
  | "update_issue"
  | "list_issue_labels"
  | "add_issue_labels"
  | "replace_issue_labels"
  | "remove_issue_label"
  | "clear_issue_labels"
  | "update_issue_comment"
  | "delete_issue_comment"
  | "list_issue_assignees"
  | "list_pull_request_commits"
  | "check_pull_request_merged"
  | "request_pull_request_reviewers"
  | "remove_pull_request_reviewers"
  | "delete_pull_request_review"
  | "dismiss_pull_request_review"
  | "list_pull_request_review_comments"
  | "update_pull_request_branch"
  | "list_repository_hooks"
  | "create_repository_hook"
  | "get_repository_hook"
  | "update_repository_hook"
  | "delete_repository_hook"
  | "list_collaborators"
  | "add_collaborator"
  | "remove_collaborator"
  | "get_collaborator_permission"
  | "list_my_organizations"
  | "get_organization"
  | "list_organization_repositories"
  | "list_organization_members"
  | "list_repository_stargazers"
  | "list_repository_watchers"
  | "star_repository"
  | "unstar_repository"
  | "list_repository_keys"
  | "create_repository_key"
  | "get_repository_key"
  | "delete_repository_key";
