import type { GitHubActionHandler } from "./runtime-shared.ts";

import { optionalInteger } from "../../core/cast.ts";
import { compactObject, githubRequestJson } from "./runtime-shared.ts";

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
