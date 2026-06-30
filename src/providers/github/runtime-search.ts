import type { GitHubActionHandler } from "./runtime-shared.ts";

import { optionalInteger, optionalText as optionalString } from "../../core/cast.ts";
import { compactObject, githubRequestJson } from "./runtime-shared.ts";

export const searchActionHandlers: Record<string, GitHubActionHandler> = {
  search_repositories(input, { accessToken, fetcher }) {
    return searchRepositories(input, accessToken, fetcher);
  },

  search_users(input, { accessToken, fetcher }) {
    return searchUsers(input, accessToken, fetcher);
  },

  search_commits(input, { accessToken, fetcher }) {
    return searchCommits(input, accessToken, fetcher);
  },

  search_code(input, { accessToken, fetcher }) {
    return searchCode(input, accessToken, fetcher);
  },

  search_labels(input, { accessToken, fetcher }) {
    return searchLabels(input, accessToken, fetcher);
  },

  search_topics(input, { accessToken, fetcher }) {
    return searchTopics(input, accessToken, fetcher);
  },
};

async function searchRepositories(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: "/search/repositories",
    query: compactObject({
      q: String(input.query),
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
    repositories: Array.isArray(response.items)
      ? (response.items as Record<string, unknown>[])
      : [],
  };
}

async function searchUsers(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: "/search/users",
    query: compactObject({
      q: String(input.query),
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

async function searchCommits(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: "/search/commits",
    query: compactObject({
      q: String(input.query),
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

async function searchCode(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: "/search/code",
    query: compactObject({
      q: String(input.query),
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

async function searchLabels(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: "/search/labels",
    query: compactObject({
      repository_id: optionalInteger(input.repositoryId),
      q: String(input.query),
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

async function searchTopics(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: "/search/topics",
    query: compactObject({
      q: String(input.query),
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
