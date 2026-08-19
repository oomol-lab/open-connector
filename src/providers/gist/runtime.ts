import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { GistActionContext, GistActionHandler } from "./runtime-shared.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  compactObject,
  gistRequest,
  gistRequestJson,
  gistRequestNoContent,
  normalizeGistError,
  optionalInteger,
} from "./runtime-shared.ts";

export const gistActionHandlers: ProviderActionHandlers<"gist", GistActionHandler> = {
  list_my_gists(input, context) {
    return listGists("/gists", input, context);
  },
  create_gist(input, context) {
    return createGist(input, context);
  },
  list_public_gists(input, context) {
    return listGists("/gists/public", input, context);
  },
  list_starred_gists(input, context) {
    return listGists("/gists/starred", input, context);
  },
  get_gist(input, context) {
    return getGist(input, context);
  },
  update_gist(input, context) {
    return updateGist(input, context);
  },
  delete_gist(input, context) {
    return deleteGist(input, context);
  },
  list_gist_commits(input, context) {
    return listGistCommits(input, context);
  },
  list_gist_forks(input, context) {
    return listGistForks(input, context);
  },
  fork_gist(input, context) {
    return forkGist(input, context);
  },
  check_gist_starred(input, context) {
    return checkGistStarred(input, context);
  },
  star_gist(input, context) {
    return starGist(input, context);
  },
  unstar_gist(input, context) {
    return unstarGist(input, context);
  },
  get_gist_revision(input, context) {
    return getGistRevision(input, context);
  },
  list_user_gists(input, context) {
    return listUserGists(input, context);
  },
  list_gist_comments(input, context) {
    return listGistComments(input, context);
  },
  create_gist_comment(input, context) {
    return createGistComment(input, context);
  },
  get_gist_comment(input, context) {
    return getGistComment(input, context);
  },
  update_gist_comment(input, context) {
    return updateGistComment(input, context);
  },
  delete_gist_comment(input, context) {
    return deleteGistComment(input, context);
  },
};

export async function validateGistCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const { response, payload } = await gistRequest({
    path: "/user",
    accessToken,
    fetcher,
    signal,
    mode: "validate",
  });

  if (!response.ok) {
    throw normalizeGistError(response, payload, "github gist credential validation failed", "validate");
  }

  const profile = optionalRecord(payload) ?? {};
  const rawAccountId = profile.id;
  if (rawAccountId === undefined || rawAccountId === null || String(rawAccountId).trim() === "") {
    throw new ProviderRequestError(502, "github gist credential validation returned empty user id");
  }

  const accountId = String(rawAccountId);
  const login = optionalString(profile.login);
  const name = optionalString(profile.name);
  const oauthScopesHeader = response.headers.get("x-oauth-scopes")?.trim() || undefined;

  return {
    profile: {
      accountId,
      displayName: name ?? login ?? accountId,
    },
    grantedScopes: ["gist"],
    metadata: compactObject({
      id: accountId,
      login,
      name,
      avatarUrl: optionalString(profile.avatar_url),
      htmlUrl: optionalString(profile.html_url),
      validationEndpoint: "/user",
      oauthScopesHeader,
    }),
  };
}

async function listGists(path: string, input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  const payload = await gistRequestJson<unknown[]>({
    path,
    query: gistListQuery(input),
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    gists: Array.isArray(payload) ? payload : [],
  };
}

async function createGist(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  const files = optionalRecord(input.files);
  if (!files || Object.keys(files).length === 0) {
    throw new ProviderRequestError(400, "files must contain at least one file");
  }

  return gistRequestJson({
    method: "POST",
    path: "/gists",
    body: compactObject({
      description: optionalString(input.description),
      public: typeof input.public === "boolean" ? input.public : undefined,
      files,
    }),
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
}

async function getGist(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  return gistRequestJson({
    path: `/gists/${encodeURIComponent(String(input.gistId))}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    mediaType: optionalMediaType(input.mediaType),
  });
}

async function updateGist(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  if (input.description === undefined && input.files === undefined) {
    throw new ProviderRequestError(400, "update_gist requires description or files");
  }

  validateGistFileUpdates(input.files);

  return gistRequestJson({
    method: "PATCH",
    path: `/gists/${encodeURIComponent(String(input.gistId))}`,
    body: compactObject({
      description: optionalString(input.description),
      files: optionalRecord(input.files),
    }),
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    mediaType: optionalMediaType(input.mediaType),
  });
}

async function deleteGist(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  await gistRequestNoContent({
    method: "DELETE",
    path: `/gists/${encodeURIComponent(String(input.gistId))}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return { deleted: true };
}

async function listGistCommits(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  const payload = await gistRequestJson<unknown[]>({
    path: `/gists/${encodeURIComponent(String(input.gistId))}/commits`,
    query: gistPaginationQuery(input),
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    commits: Array.isArray(payload) ? payload : [],
  };
}

async function listGistForks(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  const payload = await gistRequestJson<unknown[]>({
    path: `/gists/${encodeURIComponent(String(input.gistId))}/forks`,
    query: gistPaginationQuery(input),
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    forks: Array.isArray(payload) ? payload : [],
  };
}

async function forkGist(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  return gistRequestJson({
    method: "POST",
    path: `/gists/${encodeURIComponent(String(input.gistId))}/forks`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
}

async function checkGistStarred(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  const { response, payload } = await gistRequest({
    path: `/gists/${encodeURIComponent(String(input.gistId))}/star`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  if (response.status === 204) {
    return { starred: true };
  }
  if (response.status === 404) {
    return { starred: false };
  }
  if (!response.ok) {
    throw normalizeGistError(response, payload, "github gist request failed");
  }
  return { starred: true };
}

async function starGist(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  await gistRequestNoContent({
    method: "PUT",
    path: `/gists/${encodeURIComponent(String(input.gistId))}/star`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return { starred: true };
}

async function unstarGist(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  await gistRequestNoContent({
    method: "DELETE",
    path: `/gists/${encodeURIComponent(String(input.gistId))}/star`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return { starred: false };
}

async function getGistRevision(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  return gistRequestJson({
    path: `/gists/${encodeURIComponent(String(input.gistId))}/${encodeURIComponent(String(input.sha))}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    mediaType: optionalMediaType(input.mediaType),
  });
}

async function listUserGists(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  const payload = await gistRequestJson<unknown[]>({
    path: `/users/${encodeURIComponent(String(input.username))}/gists`,
    query: gistListQuery(input),
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    gists: Array.isArray(payload) ? payload : [],
  };
}

async function listGistComments(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  const payload = await gistRequestJson<unknown[]>({
    path: `/gists/${encodeURIComponent(String(input.gistId))}/comments`,
    query: gistPaginationQuery(input),
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    mediaType: optionalMediaType(input.mediaType),
  });

  return {
    comments: Array.isArray(payload) ? payload : [],
  };
}

async function createGistComment(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  return gistRequestJson({
    method: "POST",
    path: `/gists/${encodeURIComponent(String(input.gistId))}/comments`,
    body: {
      body: String(input.body),
    },
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    mediaType: optionalMediaType(input.mediaType),
  });
}

async function getGistComment(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  return gistRequestJson({
    path: `/gists/${encodeURIComponent(String(input.gistId))}/comments/${encodeURIComponent(String(input.commentId))}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    mediaType: optionalMediaType(input.mediaType),
  });
}

async function updateGistComment(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  return gistRequestJson({
    method: "PATCH",
    path: `/gists/${encodeURIComponent(String(input.gistId))}/comments/${encodeURIComponent(String(input.commentId))}`,
    body: {
      body: String(input.body),
    },
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    mediaType: optionalMediaType(input.mediaType),
  });
}

async function deleteGistComment(input: Record<string, unknown>, context: GistActionContext): Promise<unknown> {
  await gistRequestNoContent({
    method: "DELETE",
    path: `/gists/${encodeURIComponent(String(input.gistId))}/comments/${encodeURIComponent(String(input.commentId))}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return { deleted: true };
}

function gistListQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    ...gistPaginationQuery(input),
    since: optionalString(input.since),
  });
}

function gistPaginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return compactObject({
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
  });
}

function optionalMediaType(value: unknown): "json" | "raw" | "base64" | undefined {
  return value === "raw" || value === "base64" || value === "json" ? value : undefined;
}

function validateGistFileUpdates(value: unknown): void {
  if (value === undefined) {
    return;
  }

  const files = optionalRecord(value);
  if (!files) {
    throw new ProviderRequestError(400, "files must be an object");
  }

  for (const file of Object.values(files)) {
    if (file === null) {
      continue;
    }
    const update = optionalRecord(file);
    if (!update || (update.content === undefined && update.filename === undefined)) {
      throw new ProviderRequestError(400, "file update entries must include content or filename");
    }
  }
}
