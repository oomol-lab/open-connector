import type { ProviderDefinition } from "../../core/types.ts";

import { githubActions } from "./actions.ts";
import {
  githubOAuthScopes,
  githubReadUserScope,
  githubUserEmailScope,
  githubRepoScope,
  githubWorkflowScope,
  githubDeleteRepoScope,
} from "./scopes.ts";

const service = "github";

/**
 * GitHub provider backed by the GitHub REST API.
 *
 * Open-source users can either configure a personal access token or bring
 * their own GitHub OAuth app with localhost callback support.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "GitHub",
  categories: ["Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: githubOAuthScopes,
      authorizationOptions: [
        {
          id: githubReadUserScope,
          label: "Account profile",
          description: "Identify the connected GitHub account.",
          required: true,
          defaultSelected: true,
          risk: "standard",
        },
        {
          id: githubRepoScope,
          label: "Repositories",
          description: "Read and modify public and private repositories.",
          required: false,
          defaultSelected: true,
          risk: "sensitive",
        },
        {
          id: githubUserEmailScope,
          label: "Email addresses",
          description: "Read the account's email addresses.",
          required: false,
          defaultSelected: false,
          risk: "sensitive",
        },
        {
          id: githubWorkflowScope,
          label: "Workflows",
          description: "Update GitHub Actions workflow files.",
          required: false,
          defaultSelected: false,
          risk: "sensitive",
          requires: [githubRepoScope],
        },
        {
          id: githubDeleteRepoScope,
          label: "Delete repositories",
          description: "Permanently delete repositories.",
          required: false,
          defaultSelected: false,
          risk: "destructive",
        },
      ],
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal access token",
      placeholder: "github_pat_...",
      description:
        "GitHub personal access token used with the Authorization Bearer header. Fine-grained tokens are recommended.",
    },
  ],
  homepageUrl: "https://github.com",
  actions: githubActions,
};
