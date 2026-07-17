import type { GitHubActionHandler } from "./runtime-shared.ts";

import { optionalBoolean, optionalInteger, optionalRawString, optionalString } from "../../core/cast.ts";
import { compactObject, githubRequestJson, githubRequestNoContent } from "./runtime-shared.ts";

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
        name: optionalRawString(input.name),
        body: optionalRawString(input.body),
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

  update_release(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PATCH",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/${String(input.releaseId)}`,
      body: compactObject({
        tag_name: optionalString(input.tagName),
        target_commitish: optionalString(input.targetCommitish),
        name: optionalRawString(input.name),
        body: optionalRawString(input.body),
        draft: optionalBoolean(input.draft),
        prerelease: optionalBoolean(input.prerelease),
        make_latest: optionalString(input.makeLatest),
      }),
      accessToken,
      fetcher,
    });
  },

  delete_release(input, { accessToken, fetcher }) {
    return deleteRelease(input, accessToken, fetcher);
  },

  generate_release_notes(input, { accessToken, fetcher }) {
    return generateReleaseNotes(input, accessToken, fetcher);
  },

  get_release_asset(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/assets/${String(input.assetId)}`,
      accessToken,
      fetcher,
    });
  },

  delete_release_asset(input, { accessToken, fetcher }) {
    return deleteReleaseAsset(input, accessToken, fetcher);
  },
};

async function listReleases(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
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

async function listReleaseAssets(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
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

async function deleteRelease(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/${String(input.releaseId)}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function generateReleaseNotes(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await githubRequestJson<Record<string, unknown>>({
    method: "POST",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/generate-notes`,
    body: compactObject({
      tag_name: String(input.tagName),
      target_commitish: optionalString(input.targetCommitish),
      previous_tag_name: optionalString(input.previousTagName),
      configuration_file_path: optionalString(input.configurationFilePath),
    }),
    accessToken,
    fetcher,
  });

  return {
    name: String(payload.name ?? ""),
    body: String(payload.body ?? ""),
  };
}

async function deleteReleaseAsset(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/releases/assets/${String(input.assetId)}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}
