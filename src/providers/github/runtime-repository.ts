import type { GitHubActionHandler } from "./runtime-shared.ts";

import { optionalBoolean, optionalInteger, optionalRawString, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  buildGitHubUrl,
  buildRepoContentsPath,
  compactObject,
  decodeGitHubContent,
  githubHeaders,
  githubRequestJson,
  githubRequestNoContent,
  normalizeGitHubError,
  readJsonResponse,
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
        description: optionalRawString(input.description),
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
        commit_message: optionalRawString(input.commitMessage),
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

  update_repository(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PATCH",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}`,
      body: compactObject({
        name: optionalRawString(input.name),
        description: optionalRawString(input.description),
        homepage: optionalRawString(input.homepage),
        private: optionalBoolean(input.private),
        visibility: optionalString(input.visibility),
        default_branch: optionalString(input.defaultBranch),
        has_issues: optionalBoolean(input.hasIssues),
        has_projects: optionalBoolean(input.hasProjects),
        has_wiki: optionalBoolean(input.hasWiki),
        has_discussions: optionalBoolean(input.hasDiscussions),
        allow_squash_merge: optionalBoolean(input.allowSquashMerge),
        allow_merge_commit: optionalBoolean(input.allowMergeCommit),
        allow_rebase_merge: optionalBoolean(input.allowRebaseMerge),
        allow_auto_merge: optionalBoolean(input.allowAutoMerge),
        delete_branch_on_merge: optionalBoolean(input.deleteBranchOnMerge),
        archived: optionalBoolean(input.archived),
      }),
      accessToken,
      fetcher,
    });
  },

  fork_repository(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/forks`,
      body: compactObject({
        organization: optionalString(input.organization),
        name: optionalString(input.name),
        default_branch_only: optionalBoolean(input.defaultBranchOnly),
      }),
      accessToken,
      fetcher,
    });
  },

  list_repository_forks(input, { accessToken, fetcher }) {
    return listRepositoryForks(input, accessToken, fetcher);
  },

  list_repository_tags(input, { accessToken, fetcher }) {
    return listRepositoryTags(input, accessToken, fetcher);
  },

  list_repository_languages(input, { accessToken, fetcher }) {
    return listRepositoryLanguages(input, accessToken, fetcher);
  },

  list_repository_contributors(input, { accessToken, fetcher }) {
    return listRepositoryContributors(input, accessToken, fetcher);
  },

  list_repository_topics(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/topics`,
      query: compactObject({
        per_page: optionalInteger(input.perPage),
        page: optionalInteger(input.page),
      }),
      accessToken,
      fetcher,
    });
  },

  replace_repository_topics(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "PUT",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/topics`,
      body: {
        names: (input.names as unknown[]).map(String),
      },
      accessToken,
      fetcher,
    });
  },

  get_repository_readme(input, { accessToken, fetcher }) {
    return getRepositoryReadme(input, accessToken, fetcher);
  },

  list_organization_repositories(input, { accessToken, fetcher }) {
    return listOrganizationRepositories(input, accessToken, fetcher);
  },

  list_user_repositories(input, { accessToken, fetcher }) {
    return listUserRepositories(input, accessToken, fetcher);
  },

  get_user(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/users/${encodeURIComponent(String(input.username))}`,
      accessToken,
      fetcher,
    });
  },

  list_repository_collaborators(input, { accessToken, fetcher }) {
    return listRepositoryCollaborators(input, accessToken, fetcher);
  },

  add_repository_collaborator(input, { accessToken, fetcher }) {
    return addRepositoryCollaborator(input, accessToken, fetcher);
  },

  remove_repository_collaborator(input, { accessToken, fetcher }) {
    return removeRepositoryCollaborator(input, accessToken, fetcher);
  },

  get_repository_permission_for_user(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/collaborators/${encodeURIComponent(String(input.username))}/permission`,
      accessToken,
      fetcher,
    });
  },

  get_ref(input, { accessToken, fetcher }) {
    return getRef(input, accessToken, fetcher);
  },

  list_matching_refs(input, { accessToken, fetcher }) {
    return listMatchingRefs(input, accessToken, fetcher);
  },

  update_ref(input, { accessToken, fetcher }) {
    return updateRef(input, accessToken, fetcher);
  },

  delete_ref(input, { accessToken, fetcher }) {
    return deleteRef(input, accessToken, fetcher);
  },

  create_commit_comment(input, { accessToken, fetcher }) {
    return githubRequestJson<Record<string, unknown>>({
      method: "POST",
      path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/commits/${encodeURIComponent(String(input.commitSha))}/comments`,
      body: compactObject({
        body: String(input.body),
        path: optionalString(input.path),
        position: optionalInteger(input.position),
      }),
      accessToken,
      fetcher,
    });
  },

  list_commit_comments(input, { accessToken, fetcher }) {
    return listCommitComments(input, accessToken, fetcher);
  },
};

async function listMyRepositories(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
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

async function deleteRepository(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function listBranches(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
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

async function listCommits(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
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

async function compareCommits(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
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
    commits: Array.isArray(comparison.commits) ? (comparison.commits as Record<string, unknown>[]) : [],
    files: Array.isArray(comparison.files) ? (comparison.files as Record<string, unknown>[]) : [],
  };
}

async function listDirectoryContents(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await githubRequestJson<unknown>({
    path: buildRepoContentsPath(String(input.owner), String(input.repo), optionalString(input.path)),
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

async function getFileContents(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await githubRequestJson<Record<string, unknown> | Array<Record<string, unknown>>>({
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
  const rawContent = optionalRawString(response.content)?.replace(/\n/g, "") ?? "";
  return {
    ...response,
    content_base64: rawContent,
    decoded_content: decodeGitHubContent(rawContent, encoding),
  };
}

async function listRepositoryForks(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const repositories = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/forks`,
    query: compactObject({
      sort: optionalString(input.sort),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { repositories };
}

async function listRepositoryTags(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const tags = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/tags`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { tags };
}

async function listRepositoryLanguages(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const languages = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/languages`,
    accessToken,
    fetcher,
  });

  return { languages };
}

async function listRepositoryContributors(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await githubRequestJson<Record<string, unknown>[] | null>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/contributors`,
    query: compactObject({
      anon: optionalBoolean(input.anon),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  // Upstream returns 204 with no body for an empty repository; normalize to an empty list.
  if (payload === null) {
    return { contributors: [] };
  }
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(500, "unexpected github contributors response");
  }
  return { contributors: payload };
}

async function getRepositoryReadme(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/readme`,
    query: compactObject({
      ref: optionalString(input.ref),
    }),
    accessToken,
    fetcher,
  });

  if (response.type !== "file") {
    throw new ProviderRequestError(400, "readme does not resolve to a regular file");
  }

  const encoding = optionalString(response.encoding);
  const rawContent = optionalRawString(response.content)?.replace(/\n/g, "") ?? "";
  return {
    ...response,
    content_base64: rawContent,
    decoded_content: decodeGitHubContent(rawContent, encoding),
  };
}

async function listOrganizationRepositories(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const repositories = await githubRequestJson<Record<string, unknown>[]>({
    path: `/orgs/${encodeURIComponent(String(input.org))}/repos`,
    query: compactObject({
      type: optionalString(input.type),
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

async function listUserRepositories(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const repositories = await githubRequestJson<Record<string, unknown>[]>({
    path: `/users/${encodeURIComponent(String(input.username))}/repos`,
    query: compactObject({
      type: optionalString(input.type),
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

async function listRepositoryCollaborators(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const collaborators = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/collaborators`,
    query: compactObject({
      affiliation: optionalString(input.affiliation),
      permission: optionalString(input.permission),
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { collaborators };
}

async function addRepositoryCollaborator(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher(
    buildGitHubUrl(
      `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/collaborators/${encodeURIComponent(String(input.username))}`,
    ),
    {
      method: "PUT",
      headers: githubHeaders(accessToken, true),
      body: JSON.stringify(
        compactObject({
          permission: optionalRawString(input.permission),
        }),
      ),
    },
  );

  if (response.status === 204) {
    return { invited: false, invitation: null };
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw normalizeGitHubError(response, payload, "github api request failed");
  }
  if (response.status === 201) {
    return { invited: true, invitation: payload };
  }

  throw normalizeGitHubError(response, payload, "unexpected github collaborator response");
}

async function removeRepositoryCollaborator(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/collaborators/${encodeURIComponent(String(input.username))}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

function requireBranchOrTagRef(input: Record<string, unknown>): string {
  const ref = String(input.ref);
  if (!ref.startsWith("heads/") && !ref.startsWith("tags/")) {
    throw new ProviderRequestError(400, "ref must start with heads/ or tags/");
  }
  return ref;
}

async function getRef(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const ref = requireBranchOrTagRef(input);
  return githubRequestJson<Record<string, unknown>>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/git/ref/${ref.split("/").map(encodeURIComponent).join("/")}`,
    accessToken,
    fetcher,
  });
}

async function listMatchingRefs(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const refs = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/git/matching-refs/${String(input.ref).split("/").map(encodeURIComponent).join("/")}`,
    accessToken,
    fetcher,
  });

  return { refs };
}

async function updateRef(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const ref = requireBranchOrTagRef(input);
  return githubRequestJson<Record<string, unknown>>({
    method: "PATCH",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/git/refs/${ref.split("/").map(encodeURIComponent).join("/")}`,
    body: compactObject({
      sha: String(input.sha),
      force: optionalBoolean(input.force),
    }),
    accessToken,
    fetcher,
  });
}

async function deleteRef(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const ref = requireBranchOrTagRef(input);
  await githubRequestNoContent({
    method: "DELETE",
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/git/refs/${ref.split("/").map(encodeURIComponent).join("/")}`,
    accessToken,
    fetcher,
  });

  return { ok: true };
}

async function listCommitComments(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const comments = await githubRequestJson<Record<string, unknown>[]>({
    path: `/repos/${encodeURIComponent(String(input.owner))}/${encodeURIComponent(String(input.repo))}/commits/${encodeURIComponent(String(input.commitSha))}/comments`,
    query: compactObject({
      per_page: optionalInteger(input.perPage),
      page: optionalInteger(input.page),
    }),
    accessToken,
    fetcher,
  });

  return { comments };
}
