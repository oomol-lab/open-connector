import type { CredentialValidationResult } from "../../core/types.ts";
import type { GiteaActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const giteaApiSegment = "api/v1";
const giteaValidationPath = "/user";

type GiteaRequestPhase = "validate" | "execute";
type GiteaQueryValue = string | number | boolean | readonly (string | number)[] | undefined;

export interface GiteaActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type GiteaActionHandler = (input: Record<string, unknown>, context: GiteaActionContext) => Promise<unknown>;

export const giteaActionHandlers: Record<GiteaActionName, GiteaActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_my_repositories(input, context) {
    return listMyRepositories(input, context);
  },
  get_repository(input, context) {
    return getRepository(input, context);
  },
  search_repositories(input, context) {
    return searchRepositories(input, context);
  },
  list_repository_issues(input, context) {
    return listRepositoryIssues(input, context);
  },
  get_issue(input, context) {
    return getIssue(input, context);
  },
  create_issue(input, context) {
    return createIssue(input, context);
  },
  list_issue_comments(input, context) {
    return listIssueComments(input, context);
  },
  create_issue_comment(input, context) {
    return createIssueComment(input, context);
  },
  list_pull_requests(input, context) {
    return listPullRequests(input, context);
  },
  get_pull_request(input, context) {
    return getPullRequest(input, context);
  },
  create_pull_request(input, context) {
    return createPullRequest(input, context);
  },
  update_pull_request(input, context) {
    return updatePullRequest(input, context);
  },
  merge_pull_request(input, context) {
    return mergePullRequest(input, context);
  },
  list_pull_request_files(input, context) {
    return listPullRequestFiles(input, context);
  },
  list_pull_request_reviews(input, context) {
    return listPullRequestReviews(input, context);
  },
  create_pull_request_review(input, context) {
    return createPullRequestReview(input, context);
  },
  submit_pull_request_review(input, context) {
    return submitPullRequestReview(input, context);
  },
  get_repository_contents(input, context) {
    return getRepositoryContents(input, context);
  },
  create_file(input, context) {
    return createFile(input, context);
  },
  update_file(input, context) {
    return updateFile(input, context);
  },
  delete_file(input, context) {
    return deleteFile(input, context);
  },
  create_repository(input, context) {
    return createRepository(input, context);
  },
  update_repository(input, context) {
    return updateRepository(input, context);
  },
  delete_repository(input, context) {
    return deleteRepository(input, context);
  },
  fork_repository(input, context) {
    return forkRepository(input, context);
  },
  list_repository_topics(input, context) {
    return listRepositoryTopics(input, context);
  },
  update_repository_topics(input, context) {
    return updateRepositoryTopics(input, context);
  },
  list_branches(input, context) {
    return listBranches(input, context);
  },
  get_branch(input, context) {
    return getBranch(input, context);
  },
  create_branch(input, context) {
    return createBranch(input, context);
  },
  delete_branch(input, context) {
    return deleteBranch(input, context);
  },
  list_commits(input, context) {
    return listCommits(input, context);
  },
  get_commit(input, context) {
    return getCommit(input, context);
  },
  create_commit_status(input, context) {
    return createCommitStatus(input, context);
  },
  list_commit_statuses(input, context) {
    return listCommitStatuses(input, context);
  },
  list_tags(input, context) {
    return listTags(input, context);
  },
  get_tag(input, context) {
    return getTag(input, context);
  },
  create_tag(input, context) {
    return createTag(input, context);
  },
  delete_tag(input, context) {
    return deleteTag(input, context);
  },
  list_releases(input, context) {
    return listReleases(input, context);
  },
  get_release(input, context) {
    return getRelease(input, context);
  },
  create_release(input, context) {
    return createRelease(input, context);
  },
  update_release(input, context) {
    return updateRelease(input, context);
  },
  delete_release(input, context) {
    return deleteRelease(input, context);
  },
  list_repository_labels(input, context) {
    return listRepositoryLabels(input, context);
  },
  get_label(input, context) {
    return getLabel(input, context);
  },
  create_label(input, context) {
    return createLabel(input, context);
  },
  update_label(input, context) {
    return updateLabel(input, context);
  },
  delete_label(input, context) {
    return deleteLabel(input, context);
  },
  list_milestones(input, context) {
    return listMilestones(input, context);
  },
  get_milestone(input, context) {
    return getMilestone(input, context);
  },
  create_milestone(input, context) {
    return createMilestone(input, context);
  },
  update_milestone(input, context) {
    return updateMilestone(input, context);
  },
  delete_milestone(input, context) {
    return deleteMilestone(input, context);
  },
  update_issue(input, context) {
    return updateIssue(input, context);
  },
  list_issue_labels(input, context) {
    return listIssueLabels(input, context);
  },
  add_issue_labels(input, context) {
    return addIssueLabels(input, context);
  },
  replace_issue_labels(input, context) {
    return replaceIssueLabels(input, context);
  },
  remove_issue_label(input, context) {
    return removeIssueLabel(input, context);
  },
  clear_issue_labels(input, context) {
    return clearIssueLabels(input, context);
  },
  update_issue_comment(input, context) {
    return updateIssueComment(input, context);
  },
  delete_issue_comment(input, context) {
    return deleteIssueComment(input, context);
  },
  list_issue_assignees(input, context) {
    return listIssueAssignees(input, context);
  },
  list_pull_request_commits(input, context) {
    return listPullRequestCommits(input, context);
  },
  check_pull_request_merged(input, context) {
    return checkPullRequestMerged(input, context);
  },
  request_pull_request_reviewers(input, context) {
    return requestPullRequestReviewers(input, context);
  },
  remove_pull_request_reviewers(input, context) {
    return removePullRequestReviewers(input, context);
  },
  delete_pull_request_review(input, context) {
    return deletePullRequestReview(input, context);
  },
  dismiss_pull_request_review(input, context) {
    return dismissPullRequestReview(input, context);
  },
  list_pull_request_review_comments(input, context) {
    return listPullRequestReviewComments(input, context);
  },
  update_pull_request_branch(input, context) {
    return updatePullRequestBranch(input, context);
  },
  list_repository_hooks(input, context) {
    return listRepositoryHooks(input, context);
  },
  create_repository_hook(input, context) {
    return createRepositoryHook(input, context);
  },
  get_repository_hook(input, context) {
    return getRepositoryHook(input, context);
  },
  update_repository_hook(input, context) {
    return updateRepositoryHook(input, context);
  },
  delete_repository_hook(input, context) {
    return deleteRepositoryHook(input, context);
  },
  list_collaborators(input, context) {
    return listCollaborators(input, context);
  },
  add_collaborator(input, context) {
    return addCollaborator(input, context);
  },
  remove_collaborator(input, context) {
    return removeCollaborator(input, context);
  },
  get_collaborator_permission(input, context) {
    return getCollaboratorPermission(input, context);
  },
  list_my_organizations(input, context) {
    return listMyOrganizations(input, context);
  },
  get_organization(input, context) {
    return getOrganization(input, context);
  },
  list_organization_repositories(input, context) {
    return listOrganizationRepositories(input, context);
  },
  list_organization_members(input, context) {
    return listOrganizationMembers(input, context);
  },
  list_repository_stargazers(input, context) {
    return listRepositoryStargazers(input, context);
  },
  list_repository_watchers(input, context) {
    return listRepositoryWatchers(input, context);
  },
  star_repository(input, context) {
    return starRepository(input, context);
  },
  unstar_repository(input, context) {
    return unstarRepository(input, context);
  },
  list_repository_keys(input, context) {
    return listRepositoryKeys(input, context);
  },
  create_repository_key(input, context) {
    return createRepositoryKey(input, context);
  },
  get_repository_key(input, context) {
    return getRepositoryKey(input, context);
  },
  delete_repository_key(input, context) {
    return deleteRepositoryKey(input, context);
  },
};

export async function validateGiteaCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizeGiteaBaseUrl(input.values.baseUrl);
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: input.apiKey,
    baseUrl,
    path: giteaValidationPath,
    fetcher,
    signal,
    phase: "validate",
  });

  const login = optionalString(payload.login);
  const id = normalizeUnknownString(payload.id);
  if (!login && !id) {
    throw new ProviderRequestError(502, "gitea current user response is missing id");
  }

  return {
    profile: {
      accountId: buildGiteaProviderAccountId(baseUrl, payload),
      displayName: buildGiteaAccountLabel(payload),
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      validationEndpoint: buildValidationEndpoint(baseUrl, giteaValidationPath),
      userId: id,
      login,
      email: optionalString(payload.email),
      htmlUrl: optionalString(payload.html_url),
    }),
  };
}

async function getCurrentUser(context: GiteaActionContext): Promise<unknown> {
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: giteaValidationPath,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return payload;
}

async function listMyRepositories(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: "/user/repos",
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return compactObject({
    repositories: items,
    total_count: totalCount,
  });
}

async function getRepository(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function searchRepositories(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const { payload, totalCount } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: "/repos/search",
    query: compactObject({
      q: requireInputString(input.query, "query"),
      topic: optionalBoolean(input.topic),
      includeDesc: optionalBoolean(input.includeDescription),
      uid: readOptionalPositiveInteger(input.ownerId, "ownerId"),
      priority_owner_id: readOptionalPositiveInteger(input.priorityOwnerId, "priorityOwnerId"),
      team_id: readOptionalPositiveInteger(input.teamId, "teamId"),
      starredBy: readOptionalPositiveInteger(input.starredByUserId, "starredByUserId"),
      private: optionalBoolean(input.private),
      template: optionalBoolean(input.template),
      archived: optionalBoolean(input.archived),
      mode: optionalString(input.mode),
      exclusive: optionalBoolean(input.exclusive),
      sort: optionalString(input.sort),
      order: optionalString(input.order),
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return compactObject({
    ok: typeof payload.ok === "boolean" ? payload.ok : true,
    repositories: normalizeArray(payload.data, "gitea repository search data"),
    total_count: totalCount,
  });
}

async function listRepositoryIssues(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    query: compactObject({
      state: optionalString(input.state),
      labels: joinCsv(asOptionalArray(input.labels), "labels"),
      q: optionalString(input.query),
      milestones: joinCsv(asOptionalArray(input.milestones), "milestones"),
      since: optionalString(input.since),
      before: optionalString(input.before),
      created_by: optionalString(input.createdBy),
      assigned_by: optionalString(input.assignedBy),
      mentioned_by: optionalString(input.mentionedBy),
      type: "issues",
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    issues: items,
    total_count: totalCount,
  });
}

async function getIssue(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createIssue(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    method: "POST",
    body: compactObject({
      title: requireInputString(input.title, "title"),
      body: optionalString(input.body),
      assignees: normalizeOptionalStringArray(input.assignees, "assignees"),
      labels: normalizeOptionalPositiveIntegerArray(input.labelIds, "labelIds"),
      milestone: readOptionalPositiveInteger(input.milestoneId, "milestoneId"),
      ref: optionalString(input.ref),
      due_date: optionalString(input.dueDate),
      closed: optionalBoolean(input.closed),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function listIssueComments(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    query: compactObject({
      since: optionalString(input.since),
      before: optionalString(input.before),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    comments: items,
    total_count: totalCount,
  });
}

async function createIssueComment(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    method: "POST",
    body: {
      body: requireInputString(input.body, "body"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function listPullRequests(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    query: compactObject({
      state: optionalString(input.state),
      base_branch: optionalString(input.baseBranch),
      sort: optionalString(input.sort),
      milestone: readOptionalPositiveInteger(input.milestone, "milestone"),
      labels: normalizeOptionalPositiveIntegerArray(input.labels, "labels"),
      poster: optionalString(input.poster),
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    pull_requests: items,
    total_count: totalCount,
  });
}

async function getPullRequest(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createPullRequest(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    method: "POST",
    body: compactObject({
      title: requireInputString(input.title, "title"),
      body: optionalString(input.body),
      base: requireInputString(input.base, "base"),
      head: requireInputString(input.head, "head"),
      assignees: normalizeOptionalStringArray(input.assignees, "assignees"),
      labels: normalizeOptionalPositiveIntegerArray(input.labelIds, "labelIds"),
      milestone: readOptionalPositiveInteger(input.milestoneId, "milestoneId"),
      reviewers: normalizeOptionalStringArray(input.reviewers, "reviewers"),
      team_reviewers: normalizeOptionalStringArray(input.teamReviewers, "teamReviewers"),
      allow_maintainer_edit: optionalBoolean(input.allowMaintainerEdit),
      due_date: optionalString(input.dueDate),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function updatePullRequest(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}`,
    method: "PATCH",
    body: compactObject({
      title: optionalString(input.title),
      body: optionalString(input.body),
      state: optionalString(input.state),
      base: optionalString(input.base),
      assignees: normalizeOptionalStringArray(input.assignees, "assignees"),
      labels: normalizeOptionalPositiveIntegerArray(input.labelIds, "labelIds"),
      milestone: readOptionalPositiveInteger(input.milestoneId, "milestoneId"),
      allow_maintainer_edit: optionalBoolean(input.allowMaintainerEdit),
      unset_due_date: optionalBoolean(input.unsetDueDate),
      due_date: optionalString(input.dueDate),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function mergePullRequest(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const mergeStyle = requireInputString(input.do, "do");
  const { payload } = await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/merge`,
    method: "POST",
    body: compactObject({
      do: mergeStyle,
      merge_title_field: optionalString(input.mergeTitle),
      merge_message_field: optionalString(input.mergeMessage),
      delete_branch_after_merge: optionalBoolean(input.deleteBranchAfterMerge),
      force_merge: optionalBoolean(input.forceMerge),
      merge_when_checks_succeed: optionalBoolean(input.mergeWhenChecksSucceed),
      head_commit_id: optionalString(input.headCommitId),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
    response: optionalRecord(payload),
  });
}

async function listPullRequestFiles(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/files`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    files: items,
    total_count: totalCount,
  });
}

async function listPullRequestReviews(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/reviews`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    reviews: items,
    total_count: totalCount,
  });
}

async function createPullRequestReview(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/reviews`,
    method: "POST",
    body: compactObject({
      body: optionalString(input.body),
      event: optionalString(input.event),
      commit_id: optionalString(input.commitId),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function submitPullRequestReview(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const reviewId = requirePositiveInteger(input.reviewId, "reviewId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/reviews/${reviewId}`,
    method: "POST",
    body: compactObject({
      body: optionalString(input.body),
      event: optionalString(input.event),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function getRepositoryContents(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const filePath = requireInputString(input.filePath, "filePath");
  const { payload } = await requestGiteaJson<Record<string, unknown> | Record<string, unknown>[]>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeFilePath(filePath)}`,
    query: compactObject({
      ref: optionalString(input.ref),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createFile(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const filePath = requireInputString(input.filePath, "filePath");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeFilePath(filePath)}`,
    method: "POST",
    body: compactObject({
      content: encodeContent(requireInputString(input.content, "content")),
      message: optionalString(input.message),
      branch: optionalString(input.branch),
      new_branch: optionalString(input.newBranch),
      author: buildIdentity(input, "author"),
      committer: buildIdentity(input, "committer"),
      signoff: optionalBoolean(input.signoff),
      force_push: optionalBoolean(input.forcePush),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function updateFile(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const filePath = requireInputString(input.filePath, "filePath");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeFilePath(filePath)}`,
    method: "PUT",
    body: compactObject({
      content: encodeContent(requireInputString(input.content, "content")),
      sha: optionalString(input.sha),
      message: optionalString(input.message),
      branch: optionalString(input.branch),
      new_branch: optionalString(input.newBranch),
      from_path: optionalString(input.fromPath),
      author: buildIdentity(input, "author"),
      committer: buildIdentity(input, "committer"),
      signoff: optionalBoolean(input.signoff),
      force_push: optionalBoolean(input.forcePush),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteFile(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const filePath = requireInputString(input.filePath, "filePath");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeFilePath(filePath)}`,
    method: "DELETE",
    body: compactObject({
      sha: requireInputString(input.sha, "sha"),
      message: optionalString(input.message),
      branch: optionalString(input.branch),
      new_branch: optionalString(input.newBranch),
      author: buildIdentity(input, "author"),
      committer: buildIdentity(input, "committer"),
      signoff: optionalBoolean(input.signoff),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createRepository(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: "/user/repos",
    method: "POST",
    body: compactObject({
      name: requireInputString(input.name, "name"),
      description: optionalString(input.description),
      private: optionalBoolean(input.private),
      auto_init: optionalBoolean(input.autoInit),
      default_branch: optionalString(input.defaultBranch),
      gitignores: optionalString(input.gitignores),
      license: optionalString(input.license),
      readme: optionalString(input.readme),
      issue_labels: optionalString(input.issueLabels),
      template: optionalBoolean(input.template),
      object_format_name: optionalString(input.objectFormatName),
      trust_model: optionalString(input.trustModel),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return payload;
}

async function updateRepository(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    method: "PATCH",
    body: compactObject({
      name: optionalString(input.name),
      description: optionalString(input.description),
      website: optionalString(input.website),
      private: optionalBoolean(input.private),
      template: optionalBoolean(input.template),
      archived: optionalBoolean(input.archived),
      default_branch: optionalString(input.defaultBranch),
      default_merge_style: optionalString(input.defaultMergeStyle),
      default_delete_branch_after_merge: optionalBoolean(input.defaultDeleteBranchAfterMerge),
      default_allow_maintainer_edit: optionalBoolean(input.defaultAllowMaintainerEdit),
      has_issues: optionalBoolean(input.hasIssues),
      has_pull_requests: optionalBoolean(input.hasPullRequests),
      has_projects: optionalBoolean(input.hasProjects),
      has_wiki: optionalBoolean(input.hasWiki),
      has_actions: optionalBoolean(input.hasActions),
      has_packages: optionalBoolean(input.hasPackages),
      has_releases: optionalBoolean(input.hasReleases),
      allow_merge_commits: optionalBoolean(input.allowMergeCommits),
      allow_rebase: optionalBoolean(input.allowRebase),
      allow_rebase_explicit: optionalBoolean(input.allowRebaseExplicit),
      allow_rebase_update: optionalBoolean(input.allowRebaseUpdate),
      allow_squash_merge: optionalBoolean(input.allowSquashMerge),
      allow_fast_forward_only_merge: optionalBoolean(input.allowFastForwardOnlyMerge),
      allow_manual_merge: optionalBoolean(input.allowManualMerge),
      autodetect_manual_merge: optionalBoolean(input.autodetectManualMerge),
      ignore_whitespace_conflicts: optionalBoolean(input.ignoreWhitespaceConflicts),
      enable_prune: optionalBoolean(input.enablePrune),
      mirror_interval: optionalString(input.mirrorInterval),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteRepository(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function forkRepository(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/forks`,
    method: "POST",
    body: compactObject({
      name: optionalString(input.name),
      organization: optionalString(input.organization),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function listRepositoryTopics(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/topics`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    topics: normalizeStringArray(payload.topics, "gitea repository topics"),
  });
}

async function updateRepositoryTopics(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const topics = normalizeOptionalStringArray(input.topics, "topics") ?? [];
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/topics`,
    method: "PUT",
    body: { topics },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  // Gitea answers this endpoint with 204 No Content, so echo the topics that were just stored.
  return compactObject({ topics });
}

async function listBranches(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    branches: items,
    total_count: totalCount,
  });
}

async function getBranch(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const branch = requireInputString(input.branch, "branch");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeFilePath(branch)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createBranch(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    method: "POST",
    body: compactObject({
      new_branch_name: requireInputString(input.newBranchName, "newBranchName"),
      old_ref_name: optionalString(input.oldRefName),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteBranch(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const branch = requireInputString(input.branch, "branch");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeFilePath(branch)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function listCommits(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits`,
    query: compactObject({
      sha: optionalString(input.sha),
      path: optionalString(input.path),
      since: optionalString(input.since),
      until: optionalString(input.until),
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    commits: items,
    total_count: totalCount,
  });
}

async function getCommit(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const sha = requireInputString(input.sha, "sha");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeFilePath(sha)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createCommitStatus(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const sha = requireInputString(input.sha, "sha");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/statuses/${encodeFilePath(sha)}`,
    method: "POST",
    body: compactObject({
      state: requireInputString(input.state, "state"),
      context: optionalString(input.context),
      description: optionalString(input.description),
      target_url: optionalString(input.targetUrl),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function listCommitStatuses(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const ref = requireInputString(input.ref, "ref");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeFilePath(ref)}/statuses`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    statuses: items,
    total_count: totalCount,
  });
}

async function listTags(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    tags: items,
    total_count: totalCount,
  });
}

async function getTag(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const tag = requireInputString(input.tag, "tag");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags/${encodeFilePath(tag)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createTag(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags`,
    method: "POST",
    body: compactObject({
      tag_name: requireInputString(input.tagName, "tagName"),
      target: optionalString(input.target),
      message: optionalString(input.message),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteTag(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const tag = requireInputString(input.tag, "tag");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags/${encodeFilePath(tag)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function listReleases(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
    query: compactObject({
      draft: optionalBoolean(input.draft),
      "pre-release": optionalBoolean(input.prerelease),
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    releases: items,
    total_count: totalCount,
  });
}

async function getRelease(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const releaseId = requirePositiveInteger(input.releaseId, "releaseId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createRelease(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
    method: "POST",
    body: compactObject({
      tag_name: requireInputString(input.tagName, "tagName"),
      name: optionalString(input.name),
      body: optionalString(input.body),
      target_commitish: optionalString(input.targetCommitish),
      draft: optionalBoolean(input.draft),
      prerelease: optionalBoolean(input.prerelease),
      tag_message: optionalString(input.tagMessage),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function updateRelease(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const releaseId = requirePositiveInteger(input.releaseId, "releaseId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}`,
    method: "PATCH",
    body: compactObject({
      tag_name: optionalString(input.tagName),
      name: optionalString(input.name),
      body: optionalString(input.body),
      target_commitish: optionalString(input.targetCommitish),
      draft: optionalBoolean(input.draft),
      prerelease: optionalBoolean(input.prerelease),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteRelease(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const releaseId = requirePositiveInteger(input.releaseId, "releaseId");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function listRepositoryLabels(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    labels: items,
    total_count: totalCount,
  });
}

async function getLabel(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const labelId = requirePositiveInteger(input.labelId, "labelId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels/${labelId}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createLabel(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
    method: "POST",
    body: compactObject({
      name: requireInputString(input.name, "name"),
      color: requireInputString(input.color, "color"),
      description: optionalString(input.description),
      exclusive: optionalBoolean(input.exclusive),
      is_archived: optionalBoolean(input.isArchived),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function updateLabel(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const labelId = requirePositiveInteger(input.labelId, "labelId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels/${labelId}`,
    method: "PATCH",
    body: compactObject({
      name: optionalString(input.name),
      color: optionalString(input.color),
      description: optionalString(input.description),
      exclusive: optionalBoolean(input.exclusive),
      is_archived: optionalBoolean(input.isArchived),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteLabel(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const labelId = requirePositiveInteger(input.labelId, "labelId");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels/${labelId}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function listMilestones(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones`,
    query: compactObject({
      state: optionalString(input.state),
      name: optionalString(input.name),
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    milestones: items,
    total_count: totalCount,
  });
}

async function getMilestone(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const milestoneId = requirePositiveInteger(input.milestoneId, "milestoneId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones/${milestoneId}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function createMilestone(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones`,
    method: "POST",
    body: compactObject({
      title: requireInputString(input.title, "title"),
      description: optionalString(input.description),
      state: optionalString(input.state),
      due_on: optionalString(input.dueOn),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function updateMilestone(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const milestoneId = requirePositiveInteger(input.milestoneId, "milestoneId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones/${milestoneId}`,
    method: "PATCH",
    body: compactObject({
      title: optionalString(input.title),
      description: optionalString(input.description),
      state: optionalString(input.state),
      due_on: optionalString(input.dueOn),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteMilestone(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const milestoneId = requirePositiveInteger(input.milestoneId, "milestoneId");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones/${milestoneId}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function updateIssue(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
    method: "PATCH",
    body: compactObject({
      title: optionalString(input.title),
      body: optionalString(input.body),
      state: optionalString(input.state),
      assignees: normalizeOptionalStringArray(input.assignees, "assignees"),
      milestone: readOptionalPositiveInteger(input.milestoneId, "milestoneId"),
      ref: optionalString(input.ref),
      due_date: optionalString(input.dueDate),
      unset_due_date: optionalBoolean(input.unsetDueDate),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function listIssueLabels(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    labels: items,
    total_count: totalCount,
  });
}

async function addIssueLabels(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`,
    method: "POST",
    body: {
      labels: normalizeOptionalPositiveIntegerArray(input.labels, "labels"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    labels: items,
    total_count: totalCount,
  });
}

async function replaceIssueLabels(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`,
    method: "PUT",
    body: {
      labels: normalizeOptionalPositiveIntegerArray(input.labels, "labels"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    labels: items,
    total_count: totalCount,
  });
}

async function removeIssueLabel(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  const labelId = requirePositiveInteger(input.labelId, "labelId");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels/${labelId}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function clearIssueLabels(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const issueNumber = requirePositiveInteger(input.issueNumber, "issueNumber");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function updateIssueComment(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const commentId = requirePositiveInteger(input.commentId, "commentId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${commentId}`,
    method: "PATCH",
    body: compactObject({
      body: requireInputString(input.body, "body"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteIssueComment(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const commentId = requirePositiveInteger(input.commentId, "commentId");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${commentId}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function listIssueAssignees(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/assignees`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    assignees: items,
    total_count: totalCount,
  });
}

async function listPullRequestCommits(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/commits`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    commits: items,
    total_count: totalCount,
  });
}

async function checkPullRequestMerged(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const response = await giteaFetch({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/merge`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  if (response.status === 204) {
    return compactObject({
      merged: true,
    });
  }
  if (response.status === 404) {
    return compactObject({
      merged: false,
    });
  }

  const payload = await readJsonResponse(response);
  throw toGiteaError(response, payload, "execute");
}

async function requestPullRequestReviewers(
  input: Record<string, unknown>,
  context: GiteaActionContext,
): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/requested_reviewers`,
    method: "POST",
    body: compactObject({
      reviewers: normalizeOptionalStringArray(input.reviewers, "reviewers"),
      team_reviewers: normalizeOptionalStringArray(input.teamReviewers, "teamReviewers"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    reviews: items,
    total_count: totalCount,
  });
}

async function removePullRequestReviewers(
  input: Record<string, unknown>,
  context: GiteaActionContext,
): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/requested_reviewers`,
    method: "DELETE",
    body: compactObject({
      reviewers: normalizeOptionalStringArray(input.reviewers, "reviewers"),
      team_reviewers: normalizeOptionalStringArray(input.teamReviewers, "teamReviewers"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function deletePullRequestReview(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const reviewId = requirePositiveInteger(input.reviewId, "reviewId");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/reviews/${reviewId}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function dismissPullRequestReview(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const reviewId = requirePositiveInteger(input.reviewId, "reviewId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/reviews/${reviewId}/dismissals`,
    method: "POST",
    body: compactObject({
      message: requireInputString(input.message, "message"),
      priors: optionalBoolean(input.priors),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function listPullRequestReviewComments(
  input: Record<string, unknown>,
  context: GiteaActionContext,
): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  const reviewId = requirePositiveInteger(input.reviewId, "reviewId");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/reviews/${reviewId}/comments`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    comments: items,
    total_count: totalCount,
  });
}

async function updatePullRequestBranch(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const pullRequestNumber = requirePositiveInteger(input.pullRequestNumber, "pullRequestNumber");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/update`,
    method: "POST",
    query: compactObject({
      style: optionalString(input.style),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function listRepositoryHooks(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    hooks: items,
    total_count: totalCount,
  });
}

async function createRepositoryHook(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
    method: "POST",
    body: compactObject({
      type: requireInputString(input.type, "type"),
      config: optionalRecord(input.config),
      events: normalizeOptionalStringArray(input.events, "events"),
      active: optionalBoolean(input.active),
      branch_filter: optionalString(input.branchFilter),
      authorization_header: optionalString(input.authorizationHeader),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function getRepositoryHook(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const hookId = requirePositiveInteger(input.hookId, "hookId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function updateRepositoryHook(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const hookId = requirePositiveInteger(input.hookId, "hookId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`,
    method: "PATCH",
    body: compactObject({
      config: optionalRecord(input.config),
      events: normalizeOptionalStringArray(input.events, "events"),
      active: optionalBoolean(input.active),
      branch_filter: optionalString(input.branchFilter),
      authorization_header: optionalString(input.authorizationHeader),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteRepositoryHook(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const hookId = requirePositiveInteger(input.hookId, "hookId");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function listCollaborators(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    collaborators: items,
    total_count: totalCount,
  });
}

async function addCollaborator(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const collaborator = requireInputString(input.collaborator, "collaborator");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(collaborator)}`,
    method: "PUT",
    body: compactObject({
      permission: optionalString(input.permission),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function removeCollaborator(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const collaborator = requireInputString(input.collaborator, "collaborator");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(collaborator)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function getCollaboratorPermission(
  input: Record<string, unknown>,
  context: GiteaActionContext,
): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const collaborator = requireInputString(input.collaborator, "collaborator");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(collaborator)}/permission`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function listMyOrganizations(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: "/user/orgs",
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return compactObject({
    organizations: items,
    total_count: totalCount,
  });
}

async function getOrganization(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const org = requireInputString(input.org, "org");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/orgs/${encodeURIComponent(org)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function listOrganizationRepositories(
  input: Record<string, unknown>,
  context: GiteaActionContext,
): Promise<unknown> {
  const org = requireInputString(input.org, "org");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/orgs/${encodeURIComponent(org)}/repos`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    repositories: items,
    total_count: totalCount,
  });
}

async function listOrganizationMembers(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const org = requireInputString(input.org, "org");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/orgs/${encodeURIComponent(org)}/members`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    members: items,
    total_count: totalCount,
  });
}

async function listRepositoryStargazers(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stargazers`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    stargazers: items,
    total_count: totalCount,
  });
}

async function listRepositoryWatchers(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/subscribers`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    watchers: items,
    total_count: totalCount,
  });
}

async function starRepository(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    method: "PUT",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function unstarRepository(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

async function listRepositoryKeys(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { items, totalCount } = await requestGiteaArray({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/keys`,
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    keys: items,
    total_count: totalCount,
  });
}

async function createRepositoryKey(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/keys`,
    method: "POST",
    body: compactObject({
      title: requireInputString(input.title, "title"),
      key: requireInputString(input.key, "key"),
      read_only: optionalBoolean(input.readOnly),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function getRepositoryKey(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const keyId = requirePositiveInteger(input.keyId, "keyId");
  const { payload } = await requestGiteaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/keys/${keyId}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return payload;
}

async function deleteRepositoryKey(input: Record<string, unknown>, context: GiteaActionContext): Promise<unknown> {
  const owner = requireInputString(input.owner, "owner");
  const repo = requireInputString(input.repo, "repo");
  const keyId = requirePositiveInteger(input.keyId, "keyId");
  await requestGiteaJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/keys/${keyId}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    ok: true,
  });
}

function buildIdentity(
  input: Record<string, unknown>,
  prefix: "author" | "committer",
): Record<string, unknown> | undefined {
  const name = optionalString(input[`${prefix}Name`]);
  const email = optionalString(input[`${prefix}Email`]);
  if (!name && !email) {
    return undefined;
  }
  return compactObject({
    name,
    email,
  });
}

function encodeContent(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function encodeFilePath(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

interface GiteaRequestInput {
  apiKey: string;
  baseUrl: string;
  path: string;
  fetcher: typeof fetch;
  phase: GiteaRequestPhase;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, GiteaQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}

async function requestGiteaJson<T>(input: GiteaRequestInput): Promise<{ payload: T; totalCount: number | undefined }> {
  const response = await giteaFetch(input);
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw toGiteaError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return {
    payload: payload as T,
    totalCount: readTotalCount(response),
  };
}

async function requestGiteaArray(
  input: GiteaRequestInput,
): Promise<{ items: Record<string, unknown>[]; totalCount: number | undefined }> {
  const response = await giteaFetch(input);
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw toGiteaError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return {
    items: normalizeArray(payload, "gitea list response"),
    totalCount: readTotalCount(response),
  };
}

async function giteaFetch(input: GiteaRequestInput): Promise<Response> {
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `token ${input.apiKey}`,
    "User-Agent": providerUserAgent,
  });

  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input.body);
  }

  return input.fetcher(buildGiteaApiUrl(input.baseUrl, input.path, input.query), {
    method: input.method ?? "GET",
    headers,
    body,
    signal: input.signal,
  });
}

function buildGiteaApiUrl(baseUrl: string, path: string, query?: Record<string, GiteaQueryValue>): string {
  assertSafeGiteaPath(path);
  const apiBaseUrl = buildGiteaApiBaseUrl(baseUrl);
  const url = new URL(pathWithoutLeadingSlash(path), apiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/**
 * Reject `..` segments before the URL parser resolves them. Owner, repository, ref and file path
 * inputs are percent-encoded per segment, but `encodeURIComponent` leaves dots untouched, so a
 * crafted input such as `../../other-owner/other-repo` would otherwise let one action reach a
 * different Gitea endpoint than the one it declares. A lone `.` cannot walk up and stays allowed
 * because Gitea reads it as the repository root.
 */
function assertSafeGiteaPath(path: string): void {
  for (const segment of path.split("/")) {
    if (segment === "..") {
      throw new ProviderRequestError(400, "gitea request path must not contain parent directory segments");
    }
  }
}

function buildGiteaApiBaseUrl(baseUrl: string): URL {
  return new URL(`${giteaApiSegment}/`, ensureTrailingSlash(baseUrl));
}

function buildValidationEndpoint(baseUrl: string, path: string): string {
  return new URL(pathWithoutLeadingSlash(path), buildGiteaApiBaseUrl(baseUrl)).pathname;
}

function normalizeGiteaBaseUrl(
  value: string | undefined,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "Base URL is required");
  }

  const parsed = assertPublicHttpUrl(trimmed, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });

  if (parsed.protocol === "http:" && !allowPrivateNetwork) {
    throw new ProviderRequestError(400, "Base URL must use https");
  }

  parsed.search = "";
  parsed.hash = "";

  let pathname = parsed.pathname;
  while (pathname.endsWith("/") && pathname !== "/") {
    pathname = pathname.slice(0, -1);
  }

  const apiSuffix = `/${giteaApiSegment}`;
  if (pathname.toLowerCase().endsWith(apiSuffix)) {
    pathname = pathname.slice(0, -apiSuffix.length) || "/";
  }

  while (pathname.endsWith("/") && pathname !== "/") {
    pathname = pathname.slice(0, -1);
  }

  parsed.pathname = pathname === "/" ? "/" : pathname;
  return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
}

export function resolveGiteaBaseUrl(input: {
  values: Record<string, string>;
  metadata: Record<string, unknown>;
}): string {
  const baseUrl = optionalString(input.metadata.baseUrl) ?? optionalString(input.values.baseUrl);
  if (!baseUrl) {
    throw new ProviderRequestError(500, "gitea provider metadata is missing baseUrl");
  }
  return normalizeGiteaBaseUrl(baseUrl);
}

function buildGiteaProviderAccountId(baseUrl: string, user: Record<string, unknown>): string {
  const instanceKey = buildInstanceKey(baseUrl);
  const id = normalizeUnknownString(user.id);
  if (id) {
    return `gitea:${instanceKey}:${id}`;
  }

  const login = optionalString(user.login);
  if (login) {
    return `gitea:${instanceKey}:${login}`;
  }

  throw new ProviderRequestError(502, "gitea current user response is missing id");
}

function buildGiteaAccountLabel(user: Record<string, unknown>): string {
  return (
    optionalString(user.full_name) ??
    optionalString(user.email) ??
    optionalString(user.login) ??
    normalizeUnknownString(user.id) ??
    "Gitea User"
  );
}

function buildInstanceKey(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
  return `${parsed.host}${pathname}`;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (parsed !== undefined && parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function normalizeOptionalPositiveIntegerArray(value: unknown, fieldName: string): number[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return value.map((item) => requirePositiveInteger(item, fieldName));
}

function normalizeOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return value.map((item) => requireInputString(item, fieldName));
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, `${fieldName} must contain only strings`);
    }
    return item;
  });
}

function normalizeArray(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((item) => optionalRecord(item) ?? {});
}

function asOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function joinCsv(value: unknown[] | undefined, fieldName: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.map((item) => {
    if (typeof item === "number") {
      return String(item);
    }
    return requireInputString(item, fieldName);
  });

  return parts.length > 0 ? parts.join(",") : undefined;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function toGiteaError(
  response: Response,
  payload: unknown,
  phase: GiteaRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.err) ??
    `gitea request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if ([400, 404, 409, 412, 422, 423].includes(response.status)) {
    return new ProviderRequestError(response.status === 404 ? 404 : 400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function readTotalCount(response: Response): number | undefined {
  const parsed = optionalIntegerLike(response.headers.get("x-total-count"), "x-total-count");
  return parsed === undefined || parsed < 0 ? undefined : parsed;
}

function normalizeUnknownString(value: unknown): string | undefined {
  if (typeof value === "string" && value) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function pathWithoutLeadingSlash(value: string): string {
  let normalized = value;
  while (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  return normalized;
}
