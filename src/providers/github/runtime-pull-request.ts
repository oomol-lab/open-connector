import type { GitHubActionHandler } from "./runtime-shared.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  buildGitHubUrl,
  compactObject,
  githubHeaders,
  githubRequestJson,
  githubRequestNoContent,
  mapReviewComment,
  normalizeGitHubError,
  normalizeRequestedReviewersResponse,
  readJsonResponse,
} from "./runtime-shared.ts";

export const pullRequestActionHandlers: Record<string, GitHubActionHandler> = {
  list_pull_requests(input, { accessToken, fetcher }) {
    return listPullRequests(input, accessToken, fetcher);
  },

  list_pull_requests_associated_with_commit(input, { accessToken, fetcher }) {
    return listPullRequestsAssociatedWithCommit(input, accessToken, fetcher);
  },

  list_pull_request_files(input, { accessToken, fetcher }) {
    return listPullRequestFiles(input, accessToken, fetcher);
  },

  list_pull_request_commits(input, { accessToken, fetcher }) {
    return listPullRequestCommits(input, accessToken, fetcher);
  },

  list_pull_request_requested_reviewers(input, { accessToken, fetcher }) {
    return listPullRequestRequestedReviewers(input, accessToken, fetcher);
  },

  list_pull_request_reviews(input, { accessToken, fetcher }) {
    return listPullRequestReviews(input, accessToken, fetcher);
  },

  list_pull_request_review_comments(input, { accessToken, fetcher }) {
    return listPullRequestReviewComments(input, accessToken, fetcher);
  },

  create_pull_request_review(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/reviews`,
      body: compactObject({
        body: optionalRawString(input.body),
        event: optionalString(input.event),
        commit_id: optionalString(input.commitId),
        comments: Array.isArray(input.comments)
          ? input.comments.map((comment) => mapReviewComment(comment))
          : undefined,
      }),
      accessToken,
      fetcher,
    });
  },

  submit_pull_request_review(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/reviews/${String(input.reviewId)}/events`,
      body: compactObject({
        event: String(input.event),
        body: optionalRawString(input.body),
      }),
      accessToken,
      fetcher,
    });
  },

  get_pull_request_review(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/reviews/${String(input.reviewId)}`,
      accessToken,
      fetcher,
    });
  },

  dismiss_pull_request_review(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PUT",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/reviews/${String(input.reviewId)}/dismissals`,
      body: {
        message: String(input.message),
      },
      accessToken,
      fetcher,
    });
  },

  delete_pending_pull_request_review(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "DELETE",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/reviews/${String(input.reviewId)}`,
      accessToken,
      fetcher,
    });
  },

  create_pull_request_review_comment(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/comments`,
      body: compactObject({
        body: String(input.body),
        commit_id: String(input.commitId),
        path: String(input.path),
        line: optionalInteger(input.line),
        side: optionalString(input.side),
        start_line: optionalInteger(input.startLine),
        start_side: optionalString(input.startSide),
      }),
      accessToken,
      fetcher,
    });
  },

  reply_pull_request_review_comment(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/comments/${String(input.commentId)}/replies`,
      body: {
        body: String(input.body),
      },
      accessToken,
      fetcher,
    });
  },

  update_pull_request_review_comment(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PATCH",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/comments/${String(input.commentId)}`,
      body: {
        body: String(input.body),
      },
      accessToken,
      fetcher,
    });
  },

  delete_pull_request_review_comment(input, { accessToken, fetcher }) {
    return deletePullRequestReviewComment(input, accessToken, fetcher);
  },

  get_pull_request(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}`,
      accessToken,
      fetcher,
    });
  },

  create_pull_request(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls`,
      body: compactObject({
        title: String(input.title),
        head: String(input.head),
        base: String(input.base),
        body: optionalRawString(input.body),
        draft: optionalBoolean(input.draft),
        maintainer_can_modify: optionalBoolean(input.maintainerCanModify),
      }),
      accessToken,
      fetcher,
    });
  },

  update_pull_request(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PATCH",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}`,
      body: compactObject({
        title: optionalRawString(input.title),
        body: optionalRawString(input.body),
        state: optionalString(input.state),
        base: optionalString(input.base),
        maintainer_can_modify: optionalBoolean(input.maintainerCanModify),
      }),
      accessToken,
      fetcher,
    });
  },

  update_pull_request_branch(input, { accessToken, fetcher }) {
    return updatePullRequestBranch(input, accessToken, fetcher);
  },

  request_pull_request_reviewers(input, { accessToken, fetcher }) {
    return requestPullRequestReviewers(input, accessToken, fetcher);
  },

  remove_pull_request_reviewers(input, { accessToken, fetcher }) {
    return removePullRequestReviewers(input, accessToken, fetcher);
  },

  merge_pull_request(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PUT",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/merge`,
      body: compactObject({
        commit_title: optionalRawString(input.commitTitle),
        commit_message: optionalRawString(input.commitMessage),
        sha: optionalString(input.sha),
        merge_method: optionalString(input.mergeMethod),
      }),
      accessToken,
      fetcher,
    });
  },

  check_pull_request_merged(input, { accessToken, fetcher }) {
    return checkPullRequestMerged(input, accessToken, fetcher);
  },

  create_commit_status(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/statuses/${encodeURIComponent(String(input.sha))}`,
      body: compactObject({
        state: String(input.state),
        context: optionalString(input.context),
        target_url: optionalString(input.targetUrl),
        description: optionalRawString(input.description),
      }),
      accessToken,
      fetcher,
    });
  },

  get_commit_statuses(input, { accessToken, fetcher }) {
    return getCommitStatuses(input, accessToken, fetcher);
  },

  list_check_runs_for_ref(input, { accessToken, fetcher }) {
    return listCheckRunsForRef(input, accessToken, fetcher);
  },

  rerequest_check_run(input, { accessToken, fetcher }) {
    return rerequestCheckRun(input, accessToken, fetcher);
  },

  rerequest_check_suite(input, { accessToken, fetcher }) {
    return rerequestCheckSuite(input, accessToken, fetcher);
  },

  list_repository_workflows(input, { accessToken, fetcher }) {
    return listRepositoryWorkflows(input, accessToken, fetcher);
  },

  get_workflow(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/workflows/${encodeURIComponent(String(input.workflowId))}`,
      accessToken,
      fetcher,
    });
  },

  dispatch_workflow(input, { accessToken, fetcher }) {
    return dispatchWorkflow(input, accessToken, fetcher);
  },

  enable_workflow(input, { accessToken, fetcher }) {
    return enableWorkflow(input, accessToken, fetcher);
  },

  disable_workflow(input, { accessToken, fetcher }) {
    return disableWorkflow(input, accessToken, fetcher);
  },

  list_workflow_runs(input, { accessToken, fetcher }) {
    return listWorkflowRuns(input, accessToken, fetcher);
  },

  get_workflow_run(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/runs/${String(input.runId)}`,
      accessToken,
      fetcher,
    });
  },

  list_workflow_run_jobs(input, { accessToken, fetcher }) {
    return listWorkflowRunJobs(input, accessToken, fetcher);
  },

  rerun_workflow(input, { accessToken, fetcher }) {
    return rerunWorkflow(input, accessToken, fetcher);
  },

  rerun_failed_jobs(input, { accessToken, fetcher }) {
    return rerunFailedJobs(input, accessToken, fetcher);
  },

  cancel_workflow_run(input, { accessToken, fetcher }) {
    return cancelWorkflowRun(input, accessToken, fetcher);
  },

  list_workflow_run_artifacts(input, { accessToken, fetcher }) {
    return listWorkflowRunArtifacts(input, accessToken, fetcher);
  },
};

async function listPullRequests(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const pullRequests = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls`,
    query: compactObject({
      state: optionalString(input.state),
      head: optionalString(input.head),
      base: optionalString(input.base),
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { pull_requests: pullRequests };
}

async function listPullRequestsAssociatedWithCommit(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const pullRequests = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/commits/${encodeURIComponent(String(input.commitSha))}/pulls`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { pull_requests: pullRequests };
}

async function listPullRequestFiles(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const files = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/files`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { files };
}

async function listPullRequestCommits(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const commits = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/commits`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { commits };
}

async function listPullRequestRequestedReviewers(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const payload = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/requested_reviewers`,
    accessToken,
    fetcher,
  });

  return {
    users: Array.isArray(payload.users) ? (payload.users as Record<string, unknown>[]) : [],
    teams: Array.isArray(payload.teams) ? (payload.teams as Record<string, unknown>[]) : [],
  };
}

async function listPullRequestReviews(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const reviews = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/reviews`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { reviews };
}

async function listPullRequestReviewComments(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const comments = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/comments`,
    query: compactObject({
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
      since: optionalString(input.since),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { comments };
}

async function deletePullRequestReviewComment(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/comments/${String(input.commentId)}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function updatePullRequestBranch(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await githubRequestJson<Record<string, unknown>>({
    method: "PUT",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/update-branch`,
    body: compactObject({
      expected_head_sha: optionalString(input.expectedHeadSha),
    }),
    accessToken,
    fetcher,
  });

  return {
    message: String(payload.message ?? ""),
    url: String(payload.url ?? ""),
  };
}

async function requestPullRequestReviewers(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await githubRequestJson<Record<string, unknown>>({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/requested_reviewers`,
    body: compactObject({
      reviewers: Array.isArray(input.reviewers) ? input.reviewers.map(String) : undefined,
      team_reviewers: Array.isArray(input.teamReviewers) ? input.teamReviewers.map(String) : undefined,
    }),
    accessToken,
    fetcher,
  });

  return normalizeRequestedReviewersResponse(payload);
}

async function removePullRequestReviewers(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await githubRequestJson<Record<string, unknown>>({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/requested_reviewers`,
    body: compactObject({
      reviewers: Array.isArray(input.reviewers) ? input.reviewers.map(String) : undefined,
      team_reviewers: Array.isArray(input.teamReviewers) ? input.teamReviewers.map(String) : undefined,
    }),
    accessToken,
    fetcher,
  });

  return normalizeRequestedReviewersResponse(payload);
}

async function checkPullRequestMerged(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher(
    buildGitHubUrl(
      `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/pulls/${String(input.pullNumber)}/merge`,
    ),
    {
      method: "GET",
      headers: githubHeaders(accessToken, false),
    },
  );

  if (response.status === 204) {
    return { merged: true };
  }
  if (response.status === 404) {
    return { merged: false };
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw normalizeGitHubError(response, payload, "github api request failed");
  }

  throw normalizeGitHubError(response, payload, "unexpected github merge-status");
}

async function getCommitStatuses(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const statuses = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/commits/${encodeURIComponent(String(input.ref))}/statuses`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { statuses };
}

async function listCheckRunsForRef(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/commits/${encodeURIComponent(String(input.ref))}/check-runs`,
    query: compactObject({
      app_id: optionalInteger(input.appId),
      check_name: optionalString(input.checkName),
      filter: optionalString(input.filter),
      status: optionalString(input.status),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return {
    total_count: Number(response.total_count ?? 0),
    check_runs: Array.isArray(response.check_runs) ? (response.check_runs as Record<string, unknown>[]) : [],
  };
}

async function rerequestCheckRun(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/check-runs/${String(input.checkRunId)}/rerequest`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function rerequestCheckSuite(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/check-suites/${String(input.checkSuiteId)}/rerequest`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function listRepositoryWorkflows(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/workflows`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return {
    total_count: Number(response.total_count ?? 0),
    workflows: Array.isArray(response.workflows) ? (response.workflows as Record<string, unknown>[]) : [],
  };
}

async function dispatchWorkflow(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/workflows/${encodeURIComponent(String(input.workflowId))}/dispatches`,
    body: compactObject({
      ref: String(input.ref),
      inputs: optionalRecord(input.inputs),
    }),
    accessToken,
    fetcher,
  });

  return { dispatched: true };
}

async function enableWorkflow(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "PUT",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/workflows/${encodeURIComponent(String(input.workflowId))}/enable`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function disableWorkflow(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "PUT",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/workflows/${encodeURIComponent(String(input.workflowId))}/disable`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function listWorkflowRuns(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/runs`,
    query: compactObject({
      actor: optionalString(input.actor),
      branch: optionalString(input.branch),
      created: optionalString(input.created),
      check_suite_id: optionalInteger(input.checkSuiteId),
      event: optionalString(input.event),
      head_sha: optionalString(input.headSha),
      status: optionalString(input.status),
      exclude_pull_requests: optionalBoolean(input.excludePullRequests),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return {
    total_count: Number(response.total_count ?? 0),
    workflow_runs: Array.isArray(response.workflow_runs) ? (response.workflow_runs as Record<string, unknown>[]) : [],
  };
}

async function listWorkflowRunJobs(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/runs/${String(input.runId)}/jobs`,
    query: compactObject({
      filter: optionalString(input.filter),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return {
    total_count: Number(response.total_count ?? 0),
    jobs: Array.isArray(response.jobs) ? (response.jobs as Record<string, unknown>[]) : [],
  };
}

async function rerunWorkflow(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/runs/${String(input.runId)}/rerun`,
    body: compactObject({
      enable_debug_logging: optionalBoolean(input.enableDebugLogging),
    }),
    accessToken,
    fetcher,
  });

  return { rerun_requested: true };
}

async function rerunFailedJobs(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/runs/${String(input.runId)}/rerun-failed-jobs`,
    body: compactObject({
      enable_debug_logging: optionalBoolean(input.enableDebugLogging),
    }),
    accessToken,
    fetcher,
  });

  return { rerun_requested: true };
}

async function cancelWorkflowRun(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/runs/${String(input.runId)}/cancel`,
    accessToken,
    fetcher,
  });

  return { cancel_requested: true };
}

async function listWorkflowRunArtifacts(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/actions/runs/${String(input.runId)}/artifacts`,
    query: compactObject({
      name: optionalString(input.name),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return {
    total_count: Number(response.total_count ?? 0),
    artifacts: Array.isArray(response.artifacts) ? (response.artifacts as Record<string, unknown>[]) : [],
  };
}
