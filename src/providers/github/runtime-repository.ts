import type { GitHubActionHandler } from "./runtime-shared.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalText as optionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  buildRepoContentsPath,
  compactObject,
  decodeGitHubContent,
  githubRequestJson,
  githubRequestNoContent,
  resolveGitHubWriteContent,
} from "./runtime-shared.ts";

export const repositoryActionHandlers: Record<string, GitHubActionHandler> = {
  get_current_user(_input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: "/user",
      accessToken,
      fetcher,
    });
  },

  list_my_repositories(input, { accessToken, fetcher }) {
    return listMyRepositories(input, accessToken, fetcher);
  },

  create_repository(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: "/user/repos",
      body: compactObject({
        name: String(input.name),
        description: optionalString(input.description),
        homepage: optionalString(input.homepage),
        private: optionalBoolean(input.private),
        auto_init: optionalBoolean(input.autoInit),
        has_issues: optionalBoolean(input.hasIssues),
        has_projects: optionalBoolean(input.hasProjects),
        has_wiki: optionalBoolean(input.hasWiki),
        has_discussions: optionalBoolean(input.hasDiscussions),
        gitignore_template: optionalString(input.gitignoreTemplate),
        license_template: optionalString(input.licenseTemplate),
      }),
      accessToken,
      fetcher,
    });
  },

  list_branches(input, { accessToken, fetcher }) {
    return listBranches(input, accessToken, fetcher);
  },

  get_branch(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/branches/${encodeURIComponent(String(input.branch))}`,
      accessToken,
      fetcher,
    });
  },

  get_repository(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}`,
      accessToken,
      fetcher,
    });
  },

  delete_repository(input, { accessToken, fetcher }) {
    return deleteRepository(input, accessToken, fetcher);
  },

  list_commits(input, { accessToken, fetcher }) {
    return listCommits(input, accessToken, fetcher);
  },

  create_ref(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/git/refs`,
      body: {
        ref: String(input.ref),
        sha: String(input.sha),
      },
      accessToken,
      fetcher,
    });
  },

  get_commit(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/commits/${encodeURIComponent(String(input.ref))}`,
      accessToken,
      fetcher,
    });
  },

  compare_commits(input, { accessToken, fetcher }) {
    return compareCommits(input, accessToken, fetcher);
  },

  list_directory_contents(input, { accessToken, fetcher }) {
    return listDirectoryContents(input, accessToken, fetcher);
  },

  get_file_contents(input, { accessToken, fetcher }) {
    return getFileContents(input, accessToken, fetcher);
  },

  merge_branch(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/merges`,
      body: compactObject({
        base: String(input.base),
        head: String(input.head),
        commit_message: optionalString(input.commitMessage),
      }),
      accessToken,
      fetcher,
    });
  },

  rename_branch(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/branches/${encodeURIComponent(String(input.branch))}/rename`,
      body: {
        new_name: String(input.newName),
      },
      accessToken,
      fetcher,
    });
  },

  sync_fork_branch_with_upstream(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/merge-upstream`,
      body: {
        branch: String(input.branch),
      },
      accessToken,
      fetcher,
    });
  },

  create_or_update_file(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PUT",
      path: buildRepoContentsPath(String(input.owner), String(input.repo), String(input.path)),
      body: compactObject({
        message: String(input.message),
        content: resolveGitHubWriteContent(input),
        sha: optionalString(input.sha),
        branch: optionalString(input.branch),
      }),
      accessToken,
      fetcher,
    });
  },

  delete_file(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "DELETE",
      path: buildRepoContentsPath(String(input.owner), String(input.repo), String(input.path)),
      body: compactObject({
        message: String(input.message),
        sha: String(input.sha),
        branch: optionalString(input.branch),
      }),
      accessToken,
      fetcher,
    });
  },
};

async function listMyRepositories(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const repositories = await githubRequestJson<Record<string, unknown>[]>({
    path: "/user/repos",
    query: compactObject({
      visibility: optionalString(input.visibility),
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

async function deleteRepository(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function listBranches(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const branches = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/branches`,
    query: compactObject({
      protected: optionalBoolean(input.protectedOnly),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { branches };
}

async function listCommits(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const commits = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/commits`,
    query: compactObject({
      sha: optionalString(input.sha),
      path: optionalString(input.path),
      author: optionalString(input.author),
      committer: optionalString(input.committer),
      since: optionalString(input.since),
      until: optionalString(input.until),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { commits };
}

async function compareCommits(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const comparison = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/compare/${encodeURIComponent(String(input.basehead))}`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return {
    comparison,
    commits: Array.isArray(comparison.commits)
      ? (comparison.commits as Record<string, unknown>[])
      : [],
    files: Array.isArray(comparison.files) ? (comparison.files as Record<string, unknown>[]) : [],
  };
}

async function listDirectoryContents(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<unknown>({
    path: buildRepoContentsPath(
      String(input.owner),
      String(input.repo),
      optionalString(input.path),
    ),
    query: compactObject({
      ref: optionalString(input.ref),
    }),
    accessToken,
    fetcher,
  });

  if (!Array.isArray(response)) {
    throw new ProviderRequestError(400, "path does not resolve to a directory");
  }

  return {
    entries: response as Record<string, unknown>[],
  };
}

async function getFileContents(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const response = await githubRequestJson<
    Record<string, unknown> | Array<Record<string, unknown>>
  >({
    path: buildRepoContentsPath(String(input.owner), String(input.repo), String(input.path)),
    query: compactObject({
      ref: optionalString(input.ref),
    }),
    accessToken,
    fetcher,
  });

  if (Array.isArray(response)) {
    throw new ProviderRequestError(400, "path resolves to a directory, not a file");
  }
  if (response.type !== "file") {
    throw new ProviderRequestError(400, "path does not resolve to a regular file");
  }

  const encoding = optionalString(response.encoding);
  const rawContent = optionalString(response.content)?.replace(/\n/g, "") ?? "";
  return {
    ...response,
    content_base64: rawContent,
    decoded_content: decodeGitHubContent(rawContent, encoding),
  };
}
