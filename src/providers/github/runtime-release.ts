import type { GitHubActionHandler } from "./runtime-shared.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalText as optionalString,
} from "../../core/cast.ts";
import { compactObject, githubRequestJson } from "./runtime-shared.ts";

export const releaseActionHandlers: Record<string, GitHubActionHandler> = {
  list_releases(input, { accessToken, fetcher }) {
    return listReleases(input, accessToken, fetcher);
  },

  create_release(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases`,
      body: compactObject({
        tag_name: String(input.tagName),
        target_commitish: optionalString(input.targetCommitish),
        name: optionalString(input.name),
        body: optionalString(input.body),
        draft: optionalBoolean(input.draft),
        prerelease: optionalBoolean(input.prerelease),
        generate_release_notes: optionalBoolean(input.generateReleaseNotes),
        make_latest: optionalString(input.makeLatest),
      }),
      accessToken,
      fetcher,
    });
  },

  get_release(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/${String(input.releaseId)}`,
      accessToken,
      fetcher,
    });
  },

  get_latest_release(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/latest`,
      accessToken,
      fetcher,
    });
  },

  get_release_by_tag(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/tags/${encodeURIComponent(String(input.tag))}`,
      accessToken,
      fetcher,
    });
  },

  list_release_assets(input, { accessToken, fetcher }) {
    return listReleaseAssets(input, accessToken, fetcher);
  },
};

async function listReleases(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const releases = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { releases };
}

async function listReleaseAssets(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const assets = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/${String(input.releaseId)}/assets`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { assets };
}
