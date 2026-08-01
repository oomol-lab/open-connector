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
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const giteaApiSegment = "api/v1";
const giteaValidationPath = "/user";

type GiteaRequestPhase = "validate" | "execute";
type GiteaQueryValue = string | number | boolean | undefined;

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
      labels: joinCsv(asOptionalArray(input.labels), "labels"),
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
      Do: mergeStyle,
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
    response: payload,
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
  const apiBaseUrl = buildGiteaApiBaseUrl(baseUrl);
  const url = new URL(pathWithoutLeadingSlash(path), apiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function buildGiteaApiBaseUrl(baseUrl: string): URL {
  return new URL(`${giteaApiSegment}/`, ensureTrailingSlash(baseUrl));
}

function buildValidationEndpoint(baseUrl: string, path: string): string {
  return new URL(pathWithoutLeadingSlash(path), buildGiteaApiBaseUrl(baseUrl)).pathname;
}

function normalizeGiteaBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "Base URL is required");
  }

  const parsed = assertPublicHttpUrl(trimmed, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });

  if (parsed.protocol !== "https:") {
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
