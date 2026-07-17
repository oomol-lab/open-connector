import type { GitHubActionHandler } from "./runtime-shared.ts";

import { optionalInteger, optionalString } from "../../core/cast.ts";
import {
  buildGitHubUrl,
  compactObject,
  githubHeaders,
  githubRequestJson,
  githubRequestNoContent,
  normalizeGitHubError,
  readJsonResponse,
} from "./runtime-shared.ts";

export const activityActionHandlers: Record<string, GitHubActionHandler> = {
  list_public_events(input, { accessToken, fetcher }) {
    return listActivityEvents("/events", input, accessToken, fetcher);
  },

  list_user_public_events(input, { accessToken, fetcher }) {
    return listActivityEvents(
      `/users/${encodeURIComponent(String(input.username))}/events/public`,
      input,
      accessToken,
      fetcher,
    );
  },

  list_user_received_public_events(input, { accessToken, fetcher }) {
    return listActivityEvents(
      `/users/${encodeURIComponent(String(input.username))}/received_events/public`,
      input,
      accessToken,
      fetcher,
    );
  },

  list_authenticated_user_events(input, { accessToken, fetcher }) {
    return listActivityEvents(
      `/users/${encodeURIComponent(String(input.username))}/events`,
      input,
      accessToken,
      fetcher,
    );
  },

  list_authenticated_user_received_events(input, { accessToken, fetcher }) {
    return listActivityEvents(
      `/users/${encodeURIComponent(String(input.username))}/received_events`,
      input,
      accessToken,
      fetcher,
    );
  },

  list_repository_events(input, { accessToken, fetcher }) {
    return listActivityEvents(
      `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/events`,
      input,
      accessToken,
      fetcher,
    );
  },

  star_repository(input, { accessToken, fetcher }) {
    return starRepository(input, accessToken, fetcher);
  },

  unstar_repository(input, { accessToken, fetcher }) {
    return unstarRepository(input, accessToken, fetcher);
  },

  check_repository_starred(input, { accessToken, fetcher }) {
    return checkRepositoryStarred(input, accessToken, fetcher);
  },

  list_repository_stargazers(input, { accessToken, fetcher }) {
    return listRepositoryStargazers(input, accessToken, fetcher);
  },

  list_my_starred_repositories(input, { accessToken, fetcher }) {
    return listMyStarredRepositories(input, accessToken, fetcher);
  },

  list_repository_watchers(input, { accessToken, fetcher }) {
    return listRepositoryWatchers(input, accessToken, fetcher);
  },
};

async function listActivityEvents(
  path: string,
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const events = await githubRequestJson<Record<string, unknown>[]>({
    path,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { events };
}

async function starRepository(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "PUT",
    path: `/user/starred/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function unstarRepository(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/user/starred/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function checkRepositoryStarred(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher(
    buildGitHubUrl(
      `/user/starred/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}`,
    ),
    {
      method: "GET",
      headers: githubHeaders(accessToken, false),
    },
  );

  if (response.status === 204) {
    return { starred: true };
  }
  if (response.status === 404) {
    return { starred: false };
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw normalizeGitHubError(response, payload, "github api request failed");
  }

  throw normalizeGitHubError(response, payload, "unexpected github star-status");
}

async function listRepositoryStargazers(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const stargazers = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/stargazers`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { stargazers };
}

async function listMyStarredRepositories(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const repositories = await githubRequestJson<Record<string, unknown>[]>({
    path: "/user/starred",
    query: compactObject({
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { repositories };
}

async function listRepositoryWatchers(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const watchers = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/subscribers`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { watchers };
}
