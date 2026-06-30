import type { GitHubActionHandler } from "./runtime-shared.ts";

import {
  nullableInteger,
  optionalInteger,
  optionalText as optionalString,
} from "../../core/cast.ts";
import {
  buildIssueAndPullRequestSearchQuery,
  compactObject,
  githubRequestJson,
  githubRequestNoContent,
} from "./runtime-shared.ts";

export const issueActionHandlers: Record<string, GitHubActionHandler> = {
  list_repository_issues(input, { accessToken, fetcher }) {
    return listRepositoryIssues(input, accessToken, fetcher);
  },

  create_issue(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues`,
      body: compactObject({
        title: String(input.title),
        body: optionalString(input.body),
        assignees: Array.isArray(input.assignees) ? input.assignees.map(String) : undefined,
        labels: Array.isArray(input.labels) ? input.labels.map(String) : undefined,
        milestone: optionalInteger(input.milestone),
      }),
      accessToken,
      fetcher,
    });
  },

  get_issue(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}`,
      accessToken,
      fetcher,
    });
  },

  update_issue(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PATCH",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}`,
      body: compactObject({
        title: optionalString(input.title),
        body: optionalString(input.body),
        state: optionalString(input.state),
        assignees: Array.isArray(input.assignees) ? input.assignees.map(String) : undefined,
        labels: Array.isArray(input.labels) ? input.labels.map(String) : undefined,
        milestone: nullableInteger(input.milestone),
      }),
      accessToken,
      fetcher,
    });
  },

  list_repository_labels(input, { accessToken, fetcher }) {
    return listRepositoryLabels(input, accessToken, fetcher);
  },

  create_label(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/labels`,
      body: compactObject({
        name: String(input.name),
        color: String(input.color),
        description: optionalString(input.description),
      }),
      accessToken,
      fetcher,
    });
  },

  list_issue_labels(input, { accessToken, fetcher }) {
    return listIssueLabels(input, accessToken, fetcher);
  },

  add_issue_labels(input, { accessToken, fetcher }) {
    return addIssueLabels(input, accessToken, fetcher);
  },

  set_issue_labels(input, { accessToken, fetcher }) {
    return setIssueLabels(input, accessToken, fetcher);
  },

  remove_issue_label(input, { accessToken, fetcher }) {
    return removeIssueLabel(input, accessToken, fetcher);
  },

  clear_issue_labels(input, { accessToken, fetcher }) {
    return clearIssueLabels(input, accessToken, fetcher);
  },

  add_issue_assignees(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/assignees`,
      body: {
        assignees: (input.assignees as unknown[]).map(String),
      },
      accessToken,
      fetcher,
    });
  },

  remove_issue_assignees(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "DELETE",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/assignees`,
      body: {
        assignees: (input.assignees as unknown[]).map(String),
      },
      accessToken,
      fetcher,
    });
  },

  lock_issue(input, { accessToken, fetcher }) {
    return lockIssue(input, accessToken, fetcher);
  },

  unlock_issue(input, { accessToken, fetcher }) {
    return unlockIssue(input, accessToken, fetcher);
  },

  list_issue_comments(input, { accessToken, fetcher }) {
    return listIssueComments(input, accessToken, fetcher);
  },

  create_issue_comment(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/comments`,
      body: {
        body: String(input.body),
      },
      accessToken,
      fetcher,
    });
  },

  search_issues_and_pull_requests(input, { accessToken, fetcher }) {
    return searchIssuesAndPullRequests(input, accessToken, fetcher);
  },

  list_issue_timeline_events(input, { accessToken, fetcher }) {
    return listIssueTimelineEvents(input, accessToken, fetcher);
  },

  list_issue_events(input, { accessToken, fetcher }) {
    return listIssueEvents(input, accessToken, fetcher);
  },

  list_repository_issue_events(input, { accessToken, fetcher }) {
    return listRepositoryIssueEvents(input, accessToken, fetcher);
  },
};

async function listRepositoryIssues(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const issues = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues`,
    query: compactObject({
      state: optionalString(input.state),
      labels: Array.isArray(input.labels) ? input.labels.join(",") : undefined,
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
      since: optionalString(input.since),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return {
    issues: issues.filter((issue) => issue.pull_request == null),
  };
}

async function listRepositoryLabels(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const labels = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/labels`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { labels };
}

async function listIssueLabels(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const labels = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/labels`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { labels };
}

async function addIssueLabels(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const labels = await githubRequestJson<Record<string, unknown>[]>({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/labels`,
    body: {
      labels: (input.labels as unknown[]).map(String),
    },
    accessToken,
    fetcher,
  });

  return { labels };
}

async function setIssueLabels(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const labels = await githubRequestJson<Record<string, unknown>[]>({
    method: "PUT",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/labels`,
    body: {
      labels: Array.isArray(input.labels) ? input.labels.map(String) : [],
    },
    accessToken,
    fetcher,
  });

  return { labels };
}

async function removeIssueLabel(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const labels = await githubRequestJson<Record<string, unknown>[]>({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/labels/${encodeURIComponent(String(input.label))}`,
    accessToken,
    fetcher,
  });

  return { labels };
}

async function clearIssueLabels(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/labels`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function lockIssue(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await githubRequestNoContent({
    method: "PUT",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/lock`,
    body: compactObject({
      lock_reason: optionalString(input.lockReason),
    }),
    accessToken,
    fetcher,
  });

  return { locked: true as const };
}

async function unlockIssue(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/lock`,
    accessToken,
    fetcher,
  });

  return { locked: false as const };
}

async function listIssueComments(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const comments = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/comments`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { comments };
}

async function searchIssuesAndPullRequests(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: "/search/issues",
    query: compactObject({
      q: buildIssueAndPullRequestSearchQuery(input),
      sort: optionalString(input.sort),
      order: optionalString(input.order),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return {
    total_count: Number(response.total_count ?? 0),
    incomplete_results: Boolean(response.incomplete_results),
    items: Array.isArray(response.items) ? (response.items as Record<string, unknown>[]) : [],
  };
}

async function listIssueTimelineEvents(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const events = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/timeline`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { events };
}

async function listIssueEvents(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const events = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/${String(input.issueNumber)}/events`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { events };
}

async function listRepositoryIssueEvents(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const events = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/issues/events`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { events };
}
