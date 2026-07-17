import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { githubDeleteRepoScopes, githubRepoScopes, githubUserReadScopes, githubWorkflowScopes } from "./scopes.ts";

const service = "github";

const anyObject = s.looseObject({}, { description: "A GitHub API object." });
const nonEmptyString = s.string({ minLength: 1 });
const nullableString = s.nullable(s.string());
const optionalPaginationFields = {
  perPage: s.integer(),
  page: s.integer(),
};
const fullyQualifiedRefSchema = s.nonEmptyString(
  "The fully qualified reference without the refs/ prefix, such as heads/main or tags/v1.0.0.",
);
const workflowIdSchema = s.anyOf("The workflow ID or workflow file name, such as ci.yml.", [
  nonEmptyString,
  s.integer({ minimum: 1 }),
]);
const githubRequiredInputFields: Record<string, string[]> = {
  create_repository: ["name"],
  list_branches: ["owner", "repo"],
  get_branch: ["owner", "repo", "branch"],
  get_repository: ["owner", "repo"],
  delete_repository: ["owner", "repo"],
  list_commits: ["owner", "repo"],
  create_ref: ["owner", "repo", "ref", "sha"],
  get_commit: ["owner", "repo", "ref"],
  compare_commits: ["owner", "repo", "basehead"],
  list_repository_issues: ["owner", "repo"],
  create_issue: ["owner", "repo", "title"],
  get_issue: ["owner", "repo", "issueNumber"],
  update_issue: ["owner", "repo", "issueNumber"],
  list_repository_labels: ["owner", "repo"],
  create_label: ["owner", "repo", "name", "color"],
  list_issue_labels: ["owner", "repo", "issueNumber"],
  add_issue_labels: ["owner", "repo", "issueNumber", "labels"],
  set_issue_labels: ["owner", "repo", "issueNumber", "labels"],
  remove_issue_label: ["owner", "repo", "issueNumber", "label"],
  clear_issue_labels: ["owner", "repo", "issueNumber"],
  add_issue_assignees: ["owner", "repo", "issueNumber", "assignees"],
  remove_issue_assignees: ["owner", "repo", "issueNumber", "assignees"],
  lock_issue: ["owner", "repo", "issueNumber"],
  unlock_issue: ["owner", "repo", "issueNumber"],
  list_issue_comments: ["owner", "repo", "issueNumber"],
  create_issue_comment: ["owner", "repo", "issueNumber", "body"],
  list_pull_requests: ["owner", "repo"],
  list_pull_requests_associated_with_commit: ["owner", "repo", "commitSha"],
  list_pull_request_files: ["owner", "repo", "pullNumber"],
  list_pull_request_commits: ["owner", "repo", "pullNumber"],
  list_pull_request_requested_reviewers: ["owner", "repo", "pullNumber"],
  list_pull_request_reviews: ["owner", "repo", "pullNumber"],
  list_pull_request_review_comments: ["owner", "repo", "pullNumber"],
  create_pull_request_review: ["owner", "repo", "pullNumber"],
  submit_pull_request_review: ["owner", "repo", "pullNumber", "reviewId", "event"],
  reply_pull_request_review_comment: ["owner", "repo", "pullNumber", "commentId", "body"],
  get_pull_request: ["owner", "repo", "pullNumber"],
  create_pull_request: ["owner", "repo", "title", "head", "base"],
  update_pull_request: ["owner", "repo", "pullNumber"],
  update_pull_request_branch: ["owner", "repo", "pullNumber"],
  request_pull_request_reviewers: ["owner", "repo", "pullNumber"],
  remove_pull_request_reviewers: ["owner", "repo", "pullNumber"],
  merge_pull_request: ["owner", "repo", "pullNumber"],
  check_pull_request_merged: ["owner", "repo", "pullNumber"],
  create_commit_status: ["owner", "repo", "sha", "state"],
  get_commit_statuses: ["owner", "repo", "ref"],
  list_check_runs_for_ref: ["owner", "repo", "ref"],
  rerequest_check_run: ["owner", "repo", "checkRunId"],
  rerequest_check_suite: ["owner", "repo", "checkSuiteId"],
  list_repository_workflows: ["owner", "repo"],
  list_workflow_runs: ["owner", "repo"],
  get_workflow_run: ["owner", "repo", "runId"],
  list_workflow_run_jobs: ["owner", "repo", "runId"],
  rerun_workflow: ["owner", "repo", "runId"],
  list_releases: ["owner", "repo"],
  create_release: ["owner", "repo", "tagName"],
  get_release: ["owner", "repo", "releaseId"],
  get_latest_release: ["owner", "repo"],
  get_release_by_tag: ["owner", "repo", "tag"],
  list_release_assets: ["owner", "repo", "releaseId"],
  list_issue_timeline_events: ["owner", "repo", "issueNumber"],
  list_issue_events: ["owner", "repo", "issueNumber"],
  list_repository_issue_events: ["owner", "repo"],
  list_user_public_events: ["username"],
  list_user_received_public_events: ["username"],
  list_authenticated_user_events: ["username"],
  list_authenticated_user_received_events: ["username"],
  list_repository_events: ["owner", "repo"],
  list_directory_contents: ["owner", "repo"],
  get_file_contents: ["owner", "repo", "path"],
  merge_branch: ["owner", "repo", "base", "head"],
  rename_branch: ["owner", "repo", "branch", "newName"],
  sync_fork_branch_with_upstream: ["owner", "repo", "branch"],
  search_repositories: ["query"],
  search_users: ["query"],
  search_commits: ["query"],
  search_code: ["query"],
  search_labels: ["repositoryId", "query"],
  search_topics: ["query"],
  create_or_update_file: ["owner", "repo", "path", "message"],
  delete_file: ["owner", "repo", "path", "message", "sha"],
  update_repository: ["owner", "repo"],
  fork_repository: ["owner", "repo"],
  list_repository_forks: ["owner", "repo"],
  list_repository_tags: ["owner", "repo"],
  list_repository_languages: ["owner", "repo"],
  list_repository_contributors: ["owner", "repo"],
  list_repository_topics: ["owner", "repo"],
  replace_repository_topics: ["owner", "repo", "names"],
  get_repository_readme: ["owner", "repo"],
  list_organization_repositories: ["org"],
  list_user_repositories: ["username"],
  get_user: ["username"],
  list_repository_collaborators: ["owner", "repo"],
  add_repository_collaborator: ["owner", "repo", "username"],
  remove_repository_collaborator: ["owner", "repo", "username"],
  get_repository_permission_for_user: ["owner", "repo", "username"],
  get_ref: ["owner", "repo", "ref"],
  list_matching_refs: ["owner", "repo", "ref"],
  update_ref: ["owner", "repo", "ref", "sha"],
  delete_ref: ["owner", "repo", "ref"],
  create_commit_comment: ["owner", "repo", "commitSha", "body"],
  list_commit_comments: ["owner", "repo", "commitSha"],
  star_repository: ["owner", "repo"],
  unstar_repository: ["owner", "repo"],
  check_repository_starred: ["owner", "repo"],
  list_repository_stargazers: ["owner", "repo"],
  list_repository_watchers: ["owner", "repo"],
  list_milestones: ["owner", "repo"],
  get_milestone: ["owner", "repo", "milestoneNumber"],
  create_milestone: ["owner", "repo", "title"],
  update_milestone: ["owner", "repo", "milestoneNumber"],
  delete_milestone: ["owner", "repo", "milestoneNumber"],
  get_issue_comment: ["owner", "repo", "commentId"],
  update_issue_comment: ["owner", "repo", "commentId", "body"],
  delete_issue_comment: ["owner", "repo", "commentId"],
  get_label: ["owner", "repo", "name"],
  update_label: ["owner", "repo", "name"],
  delete_label: ["owner", "repo", "name"],
  list_assignees: ["owner", "repo"],
  create_issue_reaction: ["owner", "repo", "issueNumber", "content"],
  create_issue_comment_reaction: ["owner", "repo", "commentId", "content"],
  get_pull_request_review: ["owner", "repo", "pullNumber", "reviewId"],
  dismiss_pull_request_review: ["owner", "repo", "pullNumber", "reviewId", "message"],
  delete_pending_pull_request_review: ["owner", "repo", "pullNumber", "reviewId"],
  update_pull_request_review_comment: ["owner", "repo", "commentId", "body"],
  delete_pull_request_review_comment: ["owner", "repo", "commentId"],
  get_workflow: ["owner", "repo", "workflowId"],
  dispatch_workflow: ["owner", "repo", "workflowId", "ref"],
  cancel_workflow_run: ["owner", "repo", "runId"],
  rerun_failed_jobs: ["owner", "repo", "runId"],
  enable_workflow: ["owner", "repo", "workflowId"],
  disable_workflow: ["owner", "repo", "workflowId"],
  list_workflow_run_artifacts: ["owner", "repo", "runId"],
  update_release: ["owner", "repo", "releaseId"],
  delete_release: ["owner", "repo", "releaseId"],
  generate_release_notes: ["owner", "repo", "tagName"],
  get_release_asset: ["owner", "repo", "assetId"],
  delete_release_asset: ["owner", "repo", "assetId"],
};

const githubUserSummarySchema = s.looseObject({
  id: s.integer(),
  login: s.string(),
  avatar_url: s.string(),
  html_url: s.string(),
  type: s.string(),
});

const githubCurrentUserSchema = extendObject(githubUserSummarySchema, {
  name: nullableString,
  email: nullableString,
  bio: nullableString,
  company: nullableString,
  location: nullableString,
});

const githubRepositorySchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  full_name: s.string(),
  private: s.boolean(),
  html_url: s.string(),
  clone_url: s.string(),
  ssh_url: s.string(),
  description: nullableString,
  default_branch: s.string(),
  visibility: s.string(),
  fork: s.boolean(),
  owner: githubUserSummarySchema,
});

const githubLabelSchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  color: s.string(),
  description: nullableString,
});

const githubIssueSchema = s.looseObject({
  id: s.integer(),
  number: s.integer(),
  title: s.string(),
  state: s.string(),
  html_url: s.string(),
  body: nullableString,
  comments: s.integer(),
  user: githubUserSummarySchema,
  assignees: s.array(githubUserSummarySchema),
  labels: s.array(s.union([githubLabelSchema, s.string()])),
  pull_request: anyObject,
});

const githubIssueCommentSchema = s.looseObject({
  id: s.integer(),
  html_url: s.string(),
  body: s.string(),
  user: s.nullable(githubUserSummarySchema),
  created_at: s.string(),
  updated_at: s.string(),
});

const githubCommitSchema = s.looseObject({
  sha: s.string(),
  html_url: s.string(),
  url: s.string(),
  commit: anyObject,
  author: githubUserSummarySchema,
  committer: githubUserSummarySchema,
  parents: s.array(anyObject),
  stats: anyObject,
  files: s.array(anyObject),
});

const githubBranchSchema = s.looseObject({
  name: s.string(),
  commit: anyObject,
  protected: s.boolean(),
});

const githubIssueEventSchema = s.looseObject({
  id: s.integer(),
  event: s.string(),
  actor: githubUserSummarySchema,
  created_at: s.string(),
  commit_id: s.string(),
});

const githubEventSchema = s.looseObject({
  id: s.string(),
  type: s.string(),
  actor: githubUserSummarySchema,
  repo: anyObject,
  org: anyObject,
  payload: anyObject,
  public: s.boolean(),
  created_at: s.string(),
});

const githubPullRequestSchema = s.looseObject({
  id: s.integer(),
  number: s.integer(),
  state: s.string(),
  title: s.string(),
  body: nullableString,
  html_url: s.string(),
  draft: s.boolean(),
  user: githubUserSummarySchema,
  head: anyObject,
  base: anyObject,
});

const githubContentEntrySchema = s.looseObject({
  type: s.stringEnum(["file", "dir", "symlink", "submodule"]),
  name: s.string(),
  path: s.string(),
  sha: s.string(),
  size: s.integer(),
  html_url: nullableString,
  download_url: nullableString,
});

const githubFileContentSchema = extendObject(githubContentEntrySchema, {
  type: s.literal("file"),
  content_base64: s.string(),
  decoded_content: s.string(),
  encoding: s.string(),
});

const githubMergePullRequestSchema = s.object({
  sha: s.string(),
  merged: s.boolean(),
  message: s.string(),
});

const githubCommitStatusSchema = s.looseObject({
  id: s.integer(),
  state: s.string(),
  context: s.string(),
  description: nullableString,
  target_url: nullableString,
  created_at: s.string(),
  updated_at: s.string(),
});

const githubCheckRunSchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  status: s.string(),
  conclusion: nullableString,
  head_sha: s.string(),
  html_url: nullableString,
  details_url: nullableString,
  started_at: nullableString,
  completed_at: nullableString,
});

const githubPullRequestReviewSchema = s.looseObject({
  id: s.integer(),
  user: s.nullable(githubUserSummarySchema),
  body: nullableString,
  state: s.string(),
  html_url: s.string(),
  commit_id: nullableString,
  submitted_at: nullableString,
});

const githubPullRequestReviewCommentSchema = s.looseObject({
  id: s.integer(),
  path: s.string(),
  body: s.string(),
  user: s.nullable(githubUserSummarySchema),
  commit_id: s.string(),
  original_commit_id: s.string(),
  diff_hunk: s.string(),
  html_url: s.string(),
  line: s.nullable(s.integer()),
  start_line: s.nullable(s.integer()),
  side: s.string(),
  start_side: nullableString,
});

const githubReviewCommentInputSchema = s.object({
  path: nonEmptyString,
  body: nonEmptyString,
  line: s.integer({ minimum: 1 }),
  side: s.stringEnum(["LEFT", "RIGHT"]),
  startLine: s.integer({ minimum: 1 }),
  startSide: s.stringEnum(["LEFT", "RIGHT"]),
});
const githubReviewCommentInputProperties = githubReviewCommentInputSchema.properties as Record<string, JsonSchema>;

const githubPullRequestRequestedReviewersSchema = s.object({
  pull_request: githubPullRequestSchema,
  requested_reviewers: s.array(githubUserSummarySchema),
  requested_teams: s.array(anyObject),
});

const githubRequestedReviewersOnlySchema = s.object({
  users: s.array(githubUserSummarySchema),
  teams: s.array(anyObject),
});

const githubWorkflowSchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  path: s.string(),
  state: s.string(),
  html_url: s.string(),
});

const githubWorkflowRunSchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  display_title: s.string(),
  workflow_id: s.integer(),
  event: s.string(),
  status: s.string(),
  conclusion: nullableString,
  head_branch: s.string(),
  head_sha: s.string(),
  html_url: s.string(),
  run_number: s.integer(),
});

const githubWorkflowJobSchema = s.looseObject({
  id: s.integer(),
  run_id: s.integer(),
  name: s.string(),
  status: s.string(),
  conclusion: nullableString,
  html_url: s.string(),
  started_at: nullableString,
  completed_at: nullableString,
  steps: s.array(anyObject),
});

const githubReleaseSchema = s.looseObject({
  id: s.integer(),
  tag_name: s.string(),
  name: nullableString,
  body: nullableString,
  draft: s.boolean(),
  prerelease: s.boolean(),
  html_url: s.string(),
  assets_url: s.string(),
  tarball_url: nullableString,
  zipball_url: nullableString,
  target_commitish: s.string(),
  author: githubUserSummarySchema,
  created_at: s.string(),
  published_at: nullableString,
});

const githubReleaseAssetSchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  label: nullableString,
  state: s.string(),
  content_type: s.string(),
  size: s.integer(),
  download_count: s.integer(),
  browser_download_url: s.string(),
  uploader: s.nullable(githubUserSummarySchema),
  created_at: s.string(),
  updated_at: s.string(),
});

const githubSearchUserSchema = s.looseObject({
  id: s.integer(),
  login: s.string(),
  type: s.string(),
  html_url: s.string(),
  avatar_url: s.string(),
  score: s.number(),
});

const githubSearchCommitSchema = s.looseObject({
  sha: s.string(),
  html_url: s.string(),
  url: s.string(),
  commit: anyObject,
  author: githubUserSummarySchema,
  committer: githubUserSummarySchema,
  repository: s.looseObject({
    id: s.integer(),
    full_name: s.string(),
    html_url: s.string(),
  }),
  score: s.number(),
});

const githubSearchLabelSchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  color: s.string(),
  description: nullableString,
  score: s.number(),
});

const githubSearchTopicSchema = s.looseObject({
  name: s.string(),
  display_name: s.string(),
  short_description: s.string(),
  description: s.string(),
  featured: s.boolean(),
  curated: s.boolean(),
  score: s.number(),
});

const githubRepositorySearchItemSchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  full_name: s.string(),
  html_url: s.string(),
  description: nullableString,
  private: s.boolean(),
  stargazers_count: s.integer(),
  language: nullableString,
  owner: githubUserSummarySchema,
});

const githubIssueSearchItemSchema = s.looseObject({
  id: s.integer(),
  number: s.integer(),
  title: s.string(),
  html_url: s.string(),
  state: s.string(),
  body: nullableString,
  repository_url: s.string(),
  pull_request: anyObject,
  user: githubUserSummarySchema,
});

const githubCodeSearchItemSchema = s.looseObject({
  name: s.string(),
  path: s.string(),
  sha: s.string(),
  url: s.string(),
  git_url: s.string(),
  html_url: s.string(),
  repository: s.looseObject({
    id: s.integer(),
    full_name: s.string(),
    html_url: s.string(),
    owner: githubUserSummarySchema,
  }),
});

const githubContentsWriteResultSchema = s.object({
  content: githubContentEntrySchema,
  commit: anyObject,
});

const githubContentsDeleteResultSchema = s.object({
  content: githubContentEntrySchema,
  commit: anyObject,
});

const githubPublicUserSchema = extendObject(githubCurrentUserSchema, {
  followers: s.integer(),
  following: s.integer(),
  public_repos: s.integer(),
});

const githubContributorSchema = s.looseObject({
  contributions: s.integer(),
  login: s.string(),
  id: s.integer(),
  avatar_url: s.string(),
  html_url: s.string(),
  type: s.string(),
});

const githubCollaboratorSchema = extendObject(githubUserSummarySchema, {
  permissions: anyObject,
  role_name: s.string(),
});

const githubRepositoryPermissionSchema = s.looseObject({
  permission: s.string(),
  role_name: s.string(),
  user: s.nullable(githubUserSummarySchema),
});

const githubMilestoneSchema = s.looseObject({
  id: s.integer(),
  number: s.integer(),
  title: s.string(),
  state: s.string(),
  description: nullableString,
  due_on: nullableString,
  open_issues: s.integer(),
  closed_issues: s.integer(),
  html_url: s.string(),
});

const githubReactionSchema = s.looseObject({
  id: s.integer(),
  content: s.string(),
  user: s.nullable(githubUserSummarySchema),
  created_at: s.string(),
});

const githubGitRefSchema = s.looseObject({
  ref: s.string(),
  node_id: s.string(),
  url: s.string(),
  object: anyObject,
});

const githubArtifactSchema = s.looseObject({
  id: s.integer(),
  name: s.string(),
  size_in_bytes: s.integer(),
  archive_download_url: s.string(),
  expired: s.boolean(),
  created_at: nullableString,
  expires_at: nullableString,
});

const githubCommitCommentSchema = s.looseObject({
  id: s.integer(),
  body: s.string(),
  html_url: s.string(),
  path: nullableString,
  position: s.nullable(s.integer()),
  user: s.nullable(githubUserSummarySchema),
  created_at: s.string(),
  updated_at: s.string(),
});

const githubTagSummarySchema = s.looseObject({
  name: s.string(),
  commit: anyObject,
  zipball_url: s.string(),
  tarball_url: s.string(),
});

const githubMutationAckSchema = s.object({
  ok: s.boolean(),
});

const issueCommentPaginationFields = {
  perPage: s.integer(),
  page: s.integer(),
};

export const githubActions: ActionDefinition[] = [
  action({
    name: "get_current_user",
    description: "Get the current authenticated GitHub user profile.",
    requiredScopes: githubUserReadScopes,
    inputSchema: s.object({}),
    outputSchema: githubCurrentUserSchema,
  }),
  action({
    name: "list_my_repositories",
    description: "List repositories visible to the authenticated GitHub user.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      visibility: s.stringEnum(["all", "public", "private"]),
      sort: s.stringEnum(["created", "updated", "pushed", "full_name"]),
      direction: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      repositories: s.array(githubRepositorySchema),
    }),
  }),
  action({
    name: "create_repository",
    description: "Create a repository for the authenticated GitHub user.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      name: nonEmptyString,
      description: s.string(),
      homepage: s.string({ format: "uri" }),
      private: s.boolean(),
      autoInit: s.boolean(),
      hasIssues: s.boolean(),
      hasProjects: s.boolean(),
      hasWiki: s.boolean(),
      hasDiscussions: s.boolean(),
      gitignoreTemplate: s.string(),
      licenseTemplate: s.string(),
    }),
    outputSchema: anyObject,
  }),
  action({
    name: "list_branches",
    description: "List branches in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      protectedOnly: s.boolean(),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      branches: s.array(githubBranchSchema),
    }),
  }),
  action({
    name: "get_branch",
    description: "Get a GitHub branch by name.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      branch: nonEmptyString,
    }),
    outputSchema: githubBranchSchema,
  }),
  action({
    name: "get_repository",
    description: "Get metadata for a GitHub repository by owner and name.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
    }),
    outputSchema: githubRepositorySchema,
  }),
  action({
    name: "delete_repository",
    description: "Delete a GitHub repository by owner and name.",
    requiredScopes: githubDeleteRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "list_commits",
    description: "List commits in a GitHub repository with optional branch, path, author, and date filters.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      sha: s.string(),
      path: s.string(),
      author: s.string(),
      committer: s.string(),
      since: s.string(),
      until: s.string(),
      perPage: s.integer(),
      page: s.integer(),
    }),
    outputSchema: s.object({
      commits: s.array(githubCommitSchema),
    }),
  }),
  action({
    name: "create_ref",
    description: "Create a Git reference in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: nonEmptyString,
      sha: nonEmptyString,
    }),
    outputSchema: anyObject,
  }),
  action({
    name: "get_commit",
    description: "Get a commit by SHA in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: nonEmptyString,
    }),
    outputSchema: githubCommitSchema,
  }),
  action({
    name: "compare_commits",
    description: "Compare two commit references in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      basehead: nonEmptyString,
      perPage: s.integer(),
      page: s.integer(),
    }),
    outputSchema: s.object({
      comparison: anyObject,
      commits: s.array(githubCommitSchema),
      files: s.array(anyObject),
    }),
  }),
  action({
    name: "list_repository_issues",
    description: "List issues for a GitHub repository. Pull requests are filtered out from the response.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      state: s.stringEnum(["open", "closed", "all"]),
      labels: s.array(s.string()),
      sort: s.stringEnum(["created", "updated", "comments"]),
      direction: s.stringEnum(["asc", "desc"]),
      since: s.string(),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      issues: s.array(githubIssueSchema),
    }),
  }),
  action({
    name: "create_issue",
    description: "Create an issue in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      title: nonEmptyString,
      body: s.string(),
      assignees: s.array(s.string()),
      labels: s.array(s.string()),
      milestone: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubIssueSchema,
  }),
  action({
    name: "get_issue",
    description: "Get a GitHub issue by number.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubIssueSchema,
  }),
  action({
    name: "update_issue",
    description: "Update a GitHub issue by number.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      title: s.string(),
      body: s.string(),
      state: s.stringEnum(["open", "closed"]),
      assignees: s.array(s.string()),
      labels: s.array(s.string()),
      milestone: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubIssueSchema,
  }),
  action({
    name: "list_repository_labels",
    description: "List labels available in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      labels: s.array(githubLabelSchema),
    }),
  }),
  action({
    name: "create_label",
    description: "Create a label in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      name: nonEmptyString,
      color: s.string(),
      description: s.string(),
    }),
    outputSchema: anyObject,
  }),
  action({
    name: "list_issue_labels",
    description: "List labels applied to a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      labels: s.array(githubLabelSchema),
    }),
  }),
  action({
    name: "add_issue_labels",
    description: "Add labels to a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      labels: s.array(nonEmptyString),
    }),
    outputSchema: s.object({
      labels: s.array(githubLabelSchema),
    }),
  }),
  action({
    name: "set_issue_labels",
    description: "Replace all labels on a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      labels: s.array(nonEmptyString),
    }),
    outputSchema: s.object({
      labels: s.array(githubLabelSchema),
    }),
  }),
  action({
    name: "remove_issue_label",
    description: "Remove one label from a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      label: nonEmptyString,
    }),
    outputSchema: s.object({
      labels: s.array(githubLabelSchema),
    }),
  }),
  action({
    name: "clear_issue_labels",
    description: "Remove all labels from a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "add_issue_assignees",
    description: "Add assignees to a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      assignees: s.array(nonEmptyString),
    }),
    outputSchema: githubIssueSchema,
  }),
  action({
    name: "remove_issue_assignees",
    description: "Remove assignees from a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      assignees: s.array(nonEmptyString),
    }),
    outputSchema: githubIssueSchema,
  }),
  action({
    name: "lock_issue",
    description: "Lock a GitHub issue conversation.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      lockReason: s.stringEnum(["off-topic", "too heated", "resolved", "spam"]),
    }),
    outputSchema: s.object({
      locked: s.literal(true),
    }),
  }),
  action({
    name: "unlock_issue",
    description: "Unlock a GitHub issue conversation.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
    }),
    outputSchema: s.object({
      locked: s.literal(false),
    }),
  }),
  action({
    name: "list_issue_comments",
    description: "List comments under a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      ...issueCommentPaginationFields,
    }),
    outputSchema: s.object({
      comments: s.array(githubIssueCommentSchema),
    }),
  }),
  action({
    name: "create_issue_comment",
    description: "Create a comment on a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      body: nonEmptyString,
    }),
    outputSchema: githubIssueCommentSchema,
  }),
  action({
    name: "search_issues_and_pull_requests",
    description: "Search GitHub issues and pull requests with raw GitHub search syntax or structured filters.",
    requiredScopes: [],
    inputSchema: s.object({
      query: s.string(),
      q: s.string(),
      owner: s.string(),
      repo: s.string(),
      state: s.stringEnum(["open", "closed", "all"]),
      label: s.string(),
      author: s.string(),
      assignee: s.string(),
      mentions: s.string(),
      language: s.string(),
      baseBranch: s.string(),
      headBranch: s.string(),
      isMerged: s.boolean(),
      type: s.stringEnum(["issue", "pr"]),
      sort: s.stringEnum([
        "comments",
        "reactions",
        "reactions-+1",
        "reactions--1",
        "reactions-smile",
        "reactions-thinking_face",
        "reactions-heart",
        "reactions-tada",
        "interactions",
        "created",
        "updated",
      ]),
      order: s.stringEnum(["asc", "desc"]),
      perPage: s.integer(),
      page: s.integer(),
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      incomplete_results: s.boolean(),
      items: s.array(githubIssueSearchItemSchema),
    }),
  }),
  action({
    name: "list_pull_requests",
    description: "List pull requests for a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      state: s.stringEnum(["open", "closed", "all"]),
      head: s.string(),
      base: s.string(),
      sort: s.stringEnum(["created", "updated", "popularity", "long-running"]),
      direction: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      pull_requests: s.array(githubPullRequestSchema),
    }),
  }),
  action({
    name: "list_pull_requests_associated_with_commit",
    description: "List pull requests associated with a commit SHA.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commitSha: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      pull_requests: s.array(githubPullRequestSchema),
    }),
  }),
  action({
    name: "list_pull_request_files",
    description: "List files changed in a GitHub pull request.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      files: s.array(anyObject),
    }),
  }),
  action({
    name: "list_pull_request_commits",
    description: "List commits on a GitHub pull request.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      commits: s.array(githubCommitSchema),
    }),
  }),
  action({
    name: "list_pull_request_requested_reviewers",
    description: "List requested reviewers on a GitHub pull request.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubRequestedReviewersOnlySchema,
  }),
  action({
    name: "list_pull_request_reviews",
    description: "List reviews for a GitHub pull request.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      perPage: s.integer(),
      page: s.integer(),
    }),
    outputSchema: s.object({
      reviews: s.array(githubPullRequestReviewSchema),
    }),
  }),
  action({
    name: "list_pull_request_review_comments",
    description: "List review comments on a GitHub pull request.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      sort: s.stringEnum(["created", "updated"]),
      direction: s.stringEnum(["asc", "desc"]),
      since: s.string(),
      perPage: s.integer(),
      page: s.integer(),
    }),
    outputSchema: s.object({
      comments: s.array(githubPullRequestReviewCommentSchema),
    }),
  }),
  action({
    name: "create_pull_request_review",
    description: "Create a review for a GitHub pull request, optionally with inline comments.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      body: s.string(),
      event: s.stringEnum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
      commitId: s.string(),
      comments: s.array(githubReviewCommentInputSchema),
    }),
    outputSchema: githubPullRequestReviewSchema,
  }),
  action({
    name: "submit_pull_request_review",
    description: "Submit a pending GitHub pull request review.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      reviewId: s.integer({ minimum: 1 }),
      event: s.stringEnum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
      body: s.string(),
    }),
    outputSchema: githubPullRequestReviewSchema,
  }),
  action({
    name: "create_pull_request_review_comment",
    description: "Create a review comment on a GitHub pull request diff.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      body: nonEmptyString,
      commitId: nonEmptyString,
      ...githubReviewCommentInputProperties,
    }),
    outputSchema: githubPullRequestReviewCommentSchema,
  }),
  action({
    name: "reply_pull_request_review_comment",
    description: "Reply to a top-level GitHub pull request review comment.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      commentId: s.integer({ minimum: 1 }),
      body: nonEmptyString,
    }),
    outputSchema: githubPullRequestReviewCommentSchema,
  }),
  action({
    name: "get_pull_request",
    description: "Get a GitHub pull request by number.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubPullRequestSchema,
  }),
  action({
    name: "create_pull_request",
    description: "Create a pull request in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      title: nonEmptyString,
      head: nonEmptyString,
      base: nonEmptyString,
      body: s.string(),
      draft: s.boolean(),
      maintainerCanModify: s.boolean(),
    }),
    outputSchema: githubPullRequestSchema,
  }),
  action({
    name: "update_pull_request",
    description: "Update a GitHub pull request title, body, state, base branch, or maintainer-can-modify flag.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      title: s.string(),
      body: s.string(),
      state: s.stringEnum(["open", "closed"]),
      base: s.string(),
      maintainerCanModify: s.boolean(),
    }),
    outputSchema: githubPullRequestSchema,
  }),
  action({
    name: "update_pull_request_branch",
    description: "Update a GitHub pull request branch with the latest base branch changes.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      expectedHeadSha: s.string(),
    }),
    outputSchema: s.object({
      message: s.string(),
      url: s.string(),
    }),
  }),
  action({
    name: "request_pull_request_reviewers",
    description: "Request reviewers on a GitHub pull request.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      reviewers: s.array(nonEmptyString),
      teamReviewers: s.array(nonEmptyString),
    }),
    outputSchema: githubPullRequestRequestedReviewersSchema,
  }),
  action({
    name: "remove_pull_request_reviewers",
    description: "Remove requested reviewers from a GitHub pull request.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      reviewers: s.array(nonEmptyString),
      teamReviewers: s.array(nonEmptyString),
    }),
    outputSchema: githubPullRequestRequestedReviewersSchema,
  }),
  action({
    name: "merge_pull_request",
    description: "Merge a GitHub pull request.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      commitTitle: s.string(),
      commitMessage: s.string(),
      sha: s.string(),
      mergeMethod: s.stringEnum(["merge", "squash", "rebase"]),
    }),
    outputSchema: githubMergePullRequestSchema,
  }),
  action({
    name: "check_pull_request_merged",
    description: "Check whether a GitHub pull request has been merged.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
    }),
    outputSchema: s.object({
      merged: s.boolean(),
    }),
  }),
  action({
    name: "create_commit_status",
    description: "Create a commit status for a GitHub commit SHA.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      sha: nonEmptyString,
      state: s.stringEnum(["error", "failure", "pending", "success"]),
      context: s.string(),
      targetUrl: s.string(),
      description: s.string(),
    }),
    outputSchema: githubCommitStatusSchema,
  }),
  action({
    name: "get_commit_statuses",
    description: "List statuses for a commit reference in reverse chronological order.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      statuses: s.array(githubCommitStatusSchema),
    }),
  }),
  action({
    name: "list_check_runs_for_ref",
    description: "List GitHub check runs for a commit SHA, branch, or tag.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: nonEmptyString,
      appId: s.integer({ minimum: 1 }),
      checkName: s.string(),
      filter: s.stringEnum(["latest", "all"]),
      status: s.string(),
      perPage: s.integer(),
      page: s.integer(),
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      check_runs: s.array(githubCheckRunSchema),
    }),
  }),
  action({
    name: "rerequest_check_run",
    description: "Re-request a GitHub check run.",
    requiredScopes: githubWorkflowScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      checkRunId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "rerequest_check_suite",
    description: "Re-request a GitHub check suite.",
    requiredScopes: githubWorkflowScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      checkSuiteId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "list_repository_workflows",
    description: "List workflows configured in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      workflows: s.array(githubWorkflowSchema),
    }),
  }),
  action({
    name: "list_workflow_runs",
    description: "List GitHub workflow runs for a repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      actor: s.string(),
      branch: s.string(),
      created: s.string(),
      checkSuiteId: s.integer({ minimum: 1 }),
      event: s.string(),
      headSha: s.string(),
      status: s.string(),
      excludePullRequests: s.boolean(),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      workflow_runs: s.array(githubWorkflowRunSchema),
    }),
  }),
  action({
    name: "get_workflow_run",
    description: "Get a GitHub workflow run by id.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      runId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubWorkflowRunSchema,
  }),
  action({
    name: "list_workflow_run_jobs",
    description: "List jobs for a GitHub workflow run.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      runId: s.integer({ minimum: 1 }),
      filter: s.stringEnum(["latest", "all"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      jobs: s.array(githubWorkflowJobSchema),
    }),
  }),
  action({
    name: "rerun_workflow",
    description: "Re-run a GitHub Actions workflow run.",
    requiredScopes: githubWorkflowScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      runId: s.integer({ minimum: 1 }),
      enableDebugLogging: s.boolean(),
    }),
    outputSchema: s.object({
      rerun_requested: s.boolean(),
    }),
  }),
  action({
    name: "list_releases",
    description: "List releases for a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      releases: s.array(githubReleaseSchema),
    }),
  }),
  action({
    name: "create_release",
    description: "Create a release in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      tagName: nonEmptyString,
      targetCommitish: s.string(),
      name: s.string(),
      body: s.string(),
      draft: s.boolean(),
      prerelease: s.boolean(),
      generateReleaseNotes: s.boolean(),
      makeLatest: s.stringEnum(["true", "false", "legacy"]),
    }),
    outputSchema: anyObject,
  }),
  action({
    name: "get_release",
    description: "Get a GitHub release by numeric id.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      releaseId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubReleaseSchema,
  }),
  action({
    name: "get_latest_release",
    description: "Get the latest published release for a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
    }),
    outputSchema: githubReleaseSchema,
  }),
  action({
    name: "get_release_by_tag",
    description: "Get a GitHub release by tag name.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      tag: nonEmptyString,
    }),
    outputSchema: githubReleaseSchema,
  }),
  action({
    name: "list_release_assets",
    description: "List assets attached to a GitHub release.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      releaseId: s.integer({ minimum: 1 }),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      assets: s.array(githubReleaseAssetSchema),
    }),
  }),
  action({
    name: "list_issue_timeline_events",
    description: "List timeline events for a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubIssueEventSchema),
    }),
  }),
  action({
    name: "list_issue_events",
    description: "List events for a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubIssueEventSchema),
    }),
  }),
  action({
    name: "list_repository_issue_events",
    description: "List issue events across a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubIssueEventSchema),
    }),
  }),
  action({
    name: "list_public_events",
    description: "List the global public GitHub event feed.",
    requiredScopes: githubUserReadScopes,
    inputSchema: s.object({
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubEventSchema),
    }),
  }),
  action({
    name: "list_user_public_events",
    description: "List public GitHub events performed by a user.",
    requiredScopes: githubUserReadScopes,
    inputSchema: s.object({
      username: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubEventSchema),
    }),
  }),
  action({
    name: "list_user_received_public_events",
    description: "List public GitHub events received by a user.",
    requiredScopes: githubUserReadScopes,
    inputSchema: s.object({
      username: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubEventSchema),
    }),
  }),
  action({
    name: "list_authenticated_user_events",
    description:
      "List activity events for a GitHub user and include private events when the authenticated credential belongs to that user.",
    requiredScopes: githubUserReadScopes,
    inputSchema: s.object({
      username: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubEventSchema),
    }),
  }),
  action({
    name: "list_authenticated_user_received_events",
    description:
      "List received activity events for a GitHub user and include private events when the authenticated credential belongs to that user.",
    requiredScopes: githubUserReadScopes,
    inputSchema: s.object({
      username: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubEventSchema),
    }),
  }),
  action({
    name: "list_repository_events",
    description: "List recent GitHub events for a repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      events: s.array(githubEventSchema),
    }),
  }),
  action({
    name: "list_directory_contents",
    description: "List entries under a repository directory path. Empty path means repository root.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      path: s.string(),
      ref: s.string(),
    }),
    outputSchema: s.object({
      entries: s.array(githubContentEntrySchema),
    }),
  }),
  action({
    name: "get_file_contents",
    description: "Read a repository file and return both base64 and decoded text when available.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      path: nonEmptyString,
      ref: s.string(),
    }),
    outputSchema: githubFileContentSchema,
  }),
  action({
    name: "merge_branch",
    description: "Merge one branch into another in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      base: nonEmptyString,
      head: nonEmptyString,
      commitMessage: s.string(),
    }),
    outputSchema: githubCommitSchema,
  }),
  action({
    name: "rename_branch",
    description: "Rename a branch in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      branch: nonEmptyString,
      newName: nonEmptyString,
    }),
    outputSchema: githubBranchSchema,
  }),
  action({
    name: "sync_fork_branch_with_upstream",
    description: "Sync a fork branch with its upstream branch.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      branch: nonEmptyString,
    }),
    outputSchema: anyObject,
  }),
  action({
    name: "search_repositories",
    description: "Search GitHub repositories with GitHub search syntax.",
    requiredScopes: [],
    inputSchema: s.object({
      query: nonEmptyString,
      sort: s.stringEnum(["stars", "forks", "help-wanted-issues", "updated"]),
      order: s.stringEnum(["asc", "desc"]),
      perPage: s.integer(),
      page: s.integer(),
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      incomplete_results: s.boolean(),
      repositories: s.array(githubRepositorySearchItemSchema),
    }),
  }),
  action({
    name: "search_users",
    description: "Search GitHub users with GitHub search syntax.",
    requiredScopes: [],
    inputSchema: s.object({
      query: nonEmptyString,
      sort: s.stringEnum(["followers", "repositories", "joined"]),
      order: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      incomplete_results: s.boolean(),
      items: s.array(githubSearchUserSchema),
    }),
  }),
  action({
    name: "search_commits",
    description: "Search GitHub commits by commit-message text and qualifiers.",
    requiredScopes: [],
    inputSchema: s.object({
      query: nonEmptyString,
      sort: s.stringEnum(["author-date", "committer-date"]),
      order: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      incomplete_results: s.boolean(),
      items: s.array(githubSearchCommitSchema),
    }),
  }),
  action({
    name: "search_code",
    description: "Search GitHub code with GitHub search syntax.",
    requiredScopes: [],
    inputSchema: s.object({
      query: nonEmptyString,
      sort: s.stringEnum(["indexed", "updated"]),
      order: s.stringEnum(["asc", "desc"]),
      perPage: s.integer(),
      page: s.integer(),
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      incomplete_results: s.boolean(),
      items: s.array(githubCodeSearchItemSchema),
    }),
  }),
  action({
    name: "search_labels",
    description: "Search labels within a GitHub repository by repository id and query.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      repositoryId: s.integer({ minimum: 1 }),
      query: nonEmptyString,
      sort: s.stringEnum(["created", "updated"]),
      order: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      incomplete_results: s.boolean(),
      items: s.array(githubSearchLabelSchema),
    }),
  }),
  action({
    name: "search_topics",
    description: "Search GitHub topics with GitHub search syntax.",
    requiredScopes: [],
    inputSchema: s.object({
      query: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      incomplete_results: s.boolean(),
      items: s.array(githubSearchTopicSchema),
    }),
  }),
  action({
    name: "create_or_update_file",
    description:
      "Create or update a repository file through the GitHub contents API. Writing under .github/workflows may require GitHub workflow scope.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      path: nonEmptyString,
      message: nonEmptyString,
      content: s.string(),
      contentBase64: s.string(),
      sha: s.string(),
      branch: s.string(),
    }),
    outputSchema: githubContentsWriteResultSchema,
  }),
  action({
    name: "delete_file",
    description:
      "Delete a repository file through the GitHub contents API. Deleting under .github/workflows may require GitHub workflow scope.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      path: nonEmptyString,
      message: nonEmptyString,
      sha: nonEmptyString,
      branch: s.string(),
    }),
    outputSchema: githubContentsDeleteResultSchema,
  }),
  action({
    name: "update_repository",
    description: "Update settings and metadata for a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      name: s.string(),
      description: s.string(),
      homepage: s.string({ format: "uri" }),
      private: s.boolean(),
      visibility: s.stringEnum(["public", "private"]),
      defaultBranch: s.string(),
      hasIssues: s.boolean(),
      hasProjects: s.boolean(),
      hasWiki: s.boolean(),
      hasDiscussions: s.boolean(),
      allowSquashMerge: s.boolean(),
      allowMergeCommit: s.boolean(),
      allowRebaseMerge: s.boolean(),
      allowAutoMerge: s.boolean(),
      deleteBranchOnMerge: s.boolean(),
      archived: s.boolean(),
    }),
    outputSchema: githubRepositorySchema,
  }),
  action({
    name: "fork_repository",
    description:
      "Fork a GitHub repository. Forking happens asynchronously, so the returned repository may not be immediately ready.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      organization: s.string(),
      name: s.string(),
      defaultBranchOnly: s.boolean(),
    }),
    outputSchema: githubRepositorySchema,
  }),
  action({
    name: "list_repository_forks",
    description: "List forks of a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      sort: s.stringEnum(["newest", "oldest", "stargazers", "watchers"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      repositories: s.array(githubRepositorySchema),
    }),
  }),
  action({
    name: "list_repository_tags",
    description: "List tags in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      tags: s.array(githubTagSummarySchema),
    }),
  }),
  action({
    name: "list_repository_languages",
    description: "List languages used in a GitHub repository with byte counts.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
    }),
    outputSchema: s.object({
      languages: s.record(s.integer()),
    }),
  }),
  action({
    name: "list_repository_contributors",
    description: "List contributors to a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      anon: s.boolean("Whether to include anonymous contributors."),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      contributors: s.array(githubContributorSchema),
    }),
  }),
  action({
    name: "list_repository_topics",
    description: "List topics of a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      names: s.array(s.string()),
    }),
  }),
  action({
    name: "replace_repository_topics",
    description: "Replace all topics of a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      names: s.array("The full set of lowercase topic names to set on the repository.", s.string()),
    }),
    outputSchema: s.object({
      names: s.array(s.string()),
    }),
  }),
  action({
    name: "get_repository_readme",
    description: "Get the README of a GitHub repository and return both base64 and decoded text when available.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: s.string(),
    }),
    outputSchema: githubFileContentSchema,
  }),
  action({
    name: "list_organization_repositories",
    description: "List repositories for a GitHub organization.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      org: nonEmptyString,
      type: s.stringEnum(["all", "public", "private", "forks", "sources", "member"]),
      sort: s.stringEnum(["created", "updated", "pushed", "full_name"]),
      direction: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      repositories: s.array(githubRepositorySchema),
    }),
  }),
  action({
    name: "list_user_repositories",
    description: "List public repositories for a GitHub user.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      username: nonEmptyString,
      type: s.stringEnum(["all", "owner", "member"]),
      sort: s.stringEnum(["created", "updated", "pushed", "full_name"]),
      direction: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      repositories: s.array(githubRepositorySchema),
    }),
  }),
  action({
    name: "get_user",
    description: "Get a GitHub user profile by username.",
    requiredScopes: [],
    inputSchema: s.object({
      username: nonEmptyString,
    }),
    outputSchema: githubPublicUserSchema,
  }),
  action({
    name: "list_repository_collaborators",
    description: "List collaborators of a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      affiliation: s.stringEnum(["outside", "direct", "all"]),
      permission: s.stringEnum(["pull", "triage", "push", "maintain", "admin"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      collaborators: s.array(githubCollaboratorSchema),
    }),
  }),
  action({
    name: "add_repository_collaborator",
    description: "Add a collaborator to a GitHub repository or update their permission.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      username: nonEmptyString,
      permission: s.string(
        "The permission to grant: pull, triage, push, maintain, admin, or a custom repository role name.",
      ),
    }),
    outputSchema: s.object({
      invited: s.boolean(),
      invitation: s.nullable(anyObject),
    }),
  }),
  action({
    name: "remove_repository_collaborator",
    description: "Remove a collaborator from a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      username: nonEmptyString,
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "get_repository_permission_for_user",
    description: "Get the repository permission level of a GitHub user.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      username: nonEmptyString,
    }),
    outputSchema: githubRepositoryPermissionSchema,
  }),
  action({
    name: "get_ref",
    description: "Get a Git reference in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: fullyQualifiedRefSchema,
    }),
    outputSchema: githubGitRefSchema,
  }),
  action({
    name: "list_matching_refs",
    description: "List Git references matching a prefix in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: s.nonEmptyString(
        "The reference prefix to match, such as heads/feature. The endpoint is not paginated and always returns all matching references.",
      ),
    }),
    outputSchema: s.object({
      refs: s.array(githubGitRefSchema),
    }),
  }),
  action({
    name: "update_ref",
    description: "Update a Git reference in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: fullyQualifiedRefSchema,
      sha: nonEmptyString,
      force: s.boolean(),
    }),
    outputSchema: githubGitRefSchema,
  }),
  action({
    name: "delete_ref",
    description: "Delete a Git reference in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ref: fullyQualifiedRefSchema,
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "create_commit_comment",
    description: "Create a comment on a commit in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commitSha: nonEmptyString,
      body: nonEmptyString,
      path: s.string(),
      position: s.integer({ minimum: 1, description: "The line index in the diff to comment on." }),
    }),
    outputSchema: githubCommitCommentSchema,
  }),
  action({
    name: "list_commit_comments",
    description: "List comments on a commit in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commitSha: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      comments: s.array(githubCommitCommentSchema),
    }),
  }),
  action({
    name: "star_repository",
    description: "Star a GitHub repository for the authenticated user.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "unstar_repository",
    description: "Unstar a GitHub repository for the authenticated user.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "check_repository_starred",
    description: "Check whether the authenticated user has starred a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
    }),
    outputSchema: s.object({
      starred: s.boolean(),
    }),
  }),
  action({
    name: "list_repository_stargazers",
    description: "List users who starred a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      stargazers: s.array(githubUserSummarySchema),
    }),
  }),
  action({
    name: "list_my_starred_repositories",
    description: "List repositories starred by the authenticated GitHub user.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      sort: s.stringEnum(["created", "updated"]),
      direction: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      repositories: s.array(githubRepositorySchema),
    }),
  }),
  action({
    name: "list_repository_watchers",
    description: "List users watching a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      watchers: s.array(githubUserSummarySchema),
    }),
  }),
  action({
    name: "list_milestones",
    description: "List milestones for a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      state: s.stringEnum(["open", "closed", "all"]),
      sort: s.stringEnum(["due_on", "completeness"]),
      direction: s.stringEnum(["asc", "desc"]),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      milestones: s.array(githubMilestoneSchema),
    }),
  }),
  action({
    name: "get_milestone",
    description: "Get a GitHub milestone by number.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      milestoneNumber: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMilestoneSchema,
  }),
  action({
    name: "create_milestone",
    description: "Create a milestone in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      title: nonEmptyString,
      state: s.stringEnum(["open", "closed"]),
      description: s.string(),
      dueOn: s.string({ format: "date-time" }),
    }),
    outputSchema: githubMilestoneSchema,
  }),
  action({
    name: "update_milestone",
    description: "Update a GitHub milestone by number.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      milestoneNumber: s.integer({ minimum: 1 }),
      title: s.string(),
      state: s.stringEnum(["open", "closed"]),
      description: s.string(),
      dueOn: s.string({ format: "date-time" }),
    }),
    outputSchema: githubMilestoneSchema,
  }),
  action({
    name: "delete_milestone",
    description: "Delete a GitHub milestone by number.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      milestoneNumber: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "get_issue_comment",
    description: "Get a GitHub issue comment by ID.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commentId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubIssueCommentSchema,
  }),
  action({
    name: "update_issue_comment",
    description: "Update a GitHub issue comment by ID.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commentId: s.integer({ minimum: 1 }),
      body: nonEmptyString,
    }),
    outputSchema: githubIssueCommentSchema,
  }),
  action({
    name: "delete_issue_comment",
    description: "Delete a GitHub issue comment by ID.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commentId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "get_label",
    description: "Get a GitHub label by name.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      name: nonEmptyString,
    }),
    outputSchema: githubLabelSchema,
  }),
  action({
    name: "update_label",
    description: "Update a GitHub label by name.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      name: nonEmptyString,
      newName: s.string(),
      color: s.string("The label color as a 6-character hex value without #."),
      description: s.string(),
    }),
    outputSchema: githubLabelSchema,
  }),
  action({
    name: "delete_label",
    description: "Delete a GitHub label by name.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      name: nonEmptyString,
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "list_assignees",
    description: "List available assignees for issues in a GitHub repository.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      assignees: s.array(githubUserSummarySchema),
    }),
  }),
  action({
    name: "create_issue_reaction",
    description: "Add a reaction to a GitHub issue.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      issueNumber: s.integer({ minimum: 1 }),
      content: s.stringEnum(["+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes"]),
    }),
    outputSchema: githubReactionSchema,
  }),
  action({
    name: "create_issue_comment_reaction",
    description: "Add a reaction to a GitHub issue comment.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commentId: s.integer({ minimum: 1 }),
      content: s.stringEnum(["+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes"]),
    }),
    outputSchema: githubReactionSchema,
  }),
  action({
    name: "get_pull_request_review",
    description: "Get a GitHub pull request review by ID.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      reviewId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubPullRequestReviewSchema,
  }),
  action({
    name: "dismiss_pull_request_review",
    description: "Dismiss a GitHub pull request review.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      reviewId: s.integer({ minimum: 1 }),
      message: nonEmptyString,
    }),
    outputSchema: githubPullRequestReviewSchema,
  }),
  action({
    name: "delete_pending_pull_request_review",
    description: "Delete a pending GitHub pull request review and return the deleted review.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      pullNumber: s.integer({ minimum: 1 }),
      reviewId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubPullRequestReviewSchema,
  }),
  action({
    name: "update_pull_request_review_comment",
    description: "Update a GitHub pull request review comment by ID.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commentId: s.integer({ minimum: 1 }),
      body: nonEmptyString,
    }),
    outputSchema: githubPullRequestReviewCommentSchema,
  }),
  action({
    name: "delete_pull_request_review_comment",
    description: "Delete a GitHub pull request review comment by ID.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      commentId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "get_workflow",
    description: "Get a GitHub Actions workflow by ID or file name.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      workflowId: workflowIdSchema,
    }),
    outputSchema: githubWorkflowSchema,
  }),
  action({
    name: "dispatch_workflow",
    description: "Trigger a GitHub Actions workflow dispatch event.",
    requiredScopes: githubWorkflowScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      workflowId: workflowIdSchema,
      ref: s.nonEmptyString("The branch or tag name to run the workflow on."),
      inputs: s.record("The workflow inputs. All values must be strings.", s.string()),
    }),
    outputSchema: s.object({
      dispatched: s.boolean(),
    }),
  }),
  action({
    name: "cancel_workflow_run",
    description: "Cancel a GitHub Actions workflow run.",
    requiredScopes: githubWorkflowScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      runId: s.integer({ minimum: 1 }),
    }),
    outputSchema: s.object({
      cancel_requested: s.boolean(),
    }),
  }),
  action({
    name: "rerun_failed_jobs",
    description: "Re-run failed jobs of a GitHub Actions workflow run.",
    requiredScopes: githubWorkflowScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      runId: s.integer({ minimum: 1 }),
      enableDebugLogging: s.boolean(),
    }),
    outputSchema: s.object({
      rerun_requested: s.boolean(),
    }),
  }),
  action({
    name: "enable_workflow",
    description: "Enable a GitHub Actions workflow.",
    requiredScopes: githubWorkflowScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      workflowId: workflowIdSchema,
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "disable_workflow",
    description: "Disable a GitHub Actions workflow.",
    requiredScopes: githubWorkflowScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      workflowId: workflowIdSchema,
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "list_workflow_run_artifacts",
    description: "List artifacts for a GitHub Actions workflow run.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      runId: s.integer({ minimum: 1 }),
      name: s.string("Filter artifacts by exact name."),
      ...optionalPaginationFields,
    }),
    outputSchema: s.object({
      total_count: s.integer(),
      artifacts: s.array(githubArtifactSchema),
    }),
  }),
  action({
    name: "update_release",
    description: "Update a GitHub release by numeric id.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      releaseId: s.integer({ minimum: 1 }),
      tagName: s.string(),
      targetCommitish: s.string(),
      name: s.string(),
      body: s.string(),
      draft: s.boolean(),
      prerelease: s.boolean(),
      makeLatest: s.stringEnum(["true", "false", "legacy"]),
    }),
    outputSchema: githubReleaseSchema,
  }),
  action({
    name: "delete_release",
    description: "Delete a GitHub release by numeric id.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      releaseId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMutationAckSchema,
  }),
  action({
    name: "generate_release_notes",
    description: "Generate release notes content for a GitHub release.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      tagName: nonEmptyString,
      targetCommitish: s.string(),
      previousTagName: s.string(),
      configurationFilePath: s.string(),
    }),
    outputSchema: s.object({
      name: s.string(),
      body: s.string(),
    }),
  }),
  action({
    name: "get_release_asset",
    description: "Get a GitHub release asset by numeric id.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      assetId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubReleaseAssetSchema,
  }),
  action({
    name: "delete_release_asset",
    description: "Delete a GitHub release asset by numeric id.",
    requiredScopes: githubRepoScopes,
    inputSchema: s.object({
      owner: nonEmptyString,
      repo: nonEmptyString,
      assetId: s.integer({ minimum: 1 }),
    }),
    outputSchema: githubMutationAckSchema,
  }),
];

interface GitHubActionInput {
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

function action(input: GitHubActionInput): ActionDefinition {
  return defineProviderAction(service, {
    ...input,
    inputSchema: withRequiredFields(input.inputSchema, githubRequiredInputFields[input.name]),
  });
}

function extendObject(base: JsonSchema, properties: Record<string, JsonSchema>): JsonSchema {
  return s.looseObject({
    ...((base.properties as Record<string, JsonSchema>) ?? {}),
    ...properties,
  });
}

function withRequiredFields(schema: JsonSchema, required: string[] | undefined): JsonSchema {
  if (!required || required.length === 0) {
    return schema;
  }

  return { ...schema, required };
}
