import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { giteeProjectScopes, giteeUserInfoScopes } from "./scopes.ts";

const service = "gitee";

export type GiteeActionName = (typeof giteeActions)[number]["name"];

interface GiteeActionSource {
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const giteeUser = s.looseObject(
  {
    id: s.integer({ description: "The Gitee user ID." }),
    login: s.string({ description: "The Gitee username." }),
    name: s.nullableString("The user's display name when set."),
    email: s.nullableString("The user's email address when visible."),
    avatar_url: s.string({ description: "The user's avatar URL." }),
    html_url: s.string({ description: "The user's Gitee profile URL." }),
    bio: s.nullableString("The user's biography when set."),
    public_repos: s.integer({ description: "The number of public repositories." }),
    followers: s.integer({ description: "The user's follower count." }),
    following: s.integer({ description: "The number of users followed by this user." }),
    created_at: s.string({ description: "The account creation timestamp." }),
    updated_at: s.string({ description: "The account update timestamp." }),
  },
  { description: "A Gitee user record." },
);

const giteeRepository = s.looseObject(
  {
    id: s.integer({ description: "The Gitee repository ID." }),
    full_name: s.string({ description: "The repository name including its namespace." }),
    human_name: s.string({ description: "The human-readable repository name." }),
    path: s.string({ description: "The repository path." }),
    name: s.string({ description: "The repository name." }),
    description: s.nullableString("The repository description when set."),
    private: s.boolean({ description: "Whether the repository is private." }),
    public: s.boolean({ description: "Whether the repository is public." }),
    internal: s.boolean({ description: "Whether the repository is internally visible." }),
    fork: s.boolean({ description: "Whether the repository is a fork." }),
    html_url: s.string({ description: "The repository web URL." }),
    ssh_url: s.string({ description: "The repository SSH clone URL." }),
    default_branch: s.string({ description: "The default branch name." }),
    language: s.nullableString("The primary repository language when detected."),
    forks_count: s.integer({ description: "The number of forks." }),
    stargazers_count: s.integer({ description: "The number of stars." }),
    watchers_count: s.integer({ description: "The number of watchers." }),
    open_issues_count: s.integer({ description: "The number of open issues." }),
    created_at: s.string({ description: "The repository creation timestamp." }),
    updated_at: s.string({ description: "The repository update timestamp." }),
    pushed_at: s.nullableString("The most recent push timestamp when the repository has commits."),
    owner: giteeUser,
  },
  { description: "A Gitee repository record." },
);

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "Gitee action input.");
}

const actions: GiteeActionSource[] = [
  {
    name: "get_current_user",
    description: "Get the current authenticated Gitee user profile.",
    requiredScopes: giteeUserInfoScopes,
    inputSchema: input({}),
    outputSchema: giteeUser,
  },
  {
    name: "list_my_repositories",
    description: "List repositories visible to the authenticated Gitee user.",
    requiredScopes: giteeProjectScopes,
    inputSchema: input({
      visibility: s.stringEnum(["private", "public", "all"], {
        description: "Filter repositories by visibility.",
      }),
      q: s.string({ minLength: 1, description: "Search repositories by keyword." }),
      sort: s.stringEnum(["created", "updated", "pushed", "full_name"], {
        description: "Sort repositories by a Gitee-supported field.",
      }),
      direction: s.stringEnum(["asc", "desc"], { description: "Sort direction." }),
      page: s.integer({ minimum: 1, description: "The page number to fetch." }),
      perPage: s.integer({ minimum: 1, maximum: 100, description: "The number of repositories per page." }),
    }),
    outputSchema: s.object(
      {
        repositories: s.array(giteeRepository, { description: "Repositories returned by Gitee." }),
      },
      { required: ["repositories"], description: "A Gitee repository list response." },
    ),
  },
  {
    name: "get_repository",
    description: "Get a Gitee repository by namespace owner and repository path.",
    requiredScopes: giteeProjectScopes,
    inputSchema: input(
      {
        owner: s.string({ minLength: 1, description: "The repository namespace path." }),
        repo: s.string({ minLength: 1, description: "The repository path." }),
      },
      ["owner", "repo"],
    ),
    outputSchema: giteeRepository,
  },
];

export const giteeActions: ActionDefinition[] = actions.map((action) =>
  defineProviderAction(service, {
    ...action,
    providerPermissions: [],
  }),
);
