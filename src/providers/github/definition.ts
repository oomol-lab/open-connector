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
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-repo-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";
import { snapshot as triggerSnapshot1_0 } from "./trigger-watch-pull-request.definition.ts";

const service = "github";

/**
 * GitHub provider backed by the GitHub REST API.
 *
 * Open-source users can configure a personal access token, bring their own
 * GitHub OAuth app, or connect one installation of a host-configured GitHub
 * App without copying the App private key into each connection.
 */
export const provider: ProviderDefinition = {
  nativeHttp: {
    baseUrl: "https://api.github.com",
    documentationUrl: "https://docs.github.com/en/rest",
    auth: { type: "provider" },
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
    read: [{ method: "GET", path: "^/(?:repos|orgs|users|user|search)(?:/.*)?$" }],
  },
  service,
  displayName: "GitHub",
  categories: ["Developer Tools"],
  authTypes: ["oauth2", "custom_credential", "api_key"],
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
      type: "custom_credential",
      fields: [
        {
          key: "installationId",
          label: "GitHub App installation ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "12345678",
          description:
            "The GitHub App installation to use. The host must configure OOMOL_CONNECT_GITHUB_APP_ID and OOMOL_CONNECT_GITHUB_APP_PRIVATE_KEY.",
        },
      ],
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
  triggers: [triggerSnapshot0_0, triggerSnapshot1_0],
  triggerPermissions,
};
