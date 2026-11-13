import type { ProviderDefinition } from "../../core/types.ts";

import { githubActions } from "./actions.ts";
import { githubOAuthScopes, githubReadUserScope, githubWorkflowScope, githubDeleteRepoScope } from "./scopes.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-repo-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";
import { snapshot as triggerSnapshot1_0 } from "./trigger-watch-pull-request.definition.ts";

const service = "github";

/**
 * GitHub provider backed by the GitHub REST API.
 *
 * Open-source users can either configure a personal access token, bring
 * their own GitHub OAuth app with localhost callback support, or connect a
 * GitHub App installation whose tokens the runtime mints from the App's
 * private key.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "GitHub",
  categories: ["Developer Tools"],
  authTypes: ["oauth2", "api_key", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: [githubReadUserScope],
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: githubOAuthScopes,
      authorizationOptions: [
        {
          id: githubWorkflowScope,
          label: "Workflows",
          description: "Update GitHub Actions workflow files.",
          risk: "sensitive",
        },
        {
          id: githubDeleteRepoScope,
          label: "Delete repositories",
          description: "Permanently delete repositories.",
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
    {
      type: "custom_credential",
      label: "GitHub App installation",
      description:
        "Authenticate as a GitHub App installed on an account. The runtime signs a JWT with the App's private key and mints one-hour installation access tokens on demand, so no token is pasted or stored. The token can read the repositories the installation selected plus the content of any public repository; user-only actions such as get_current_user are not supported.",
      fields: [
        {
          key: "appId",
          label: "App ID or client ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "1234567",
          description:
            "The GitHub App's client ID (recommended) or its numeric App ID, both shown on the App's settings page. GitHub Enterprise Server releases that predate client ID issuers accept only the numeric App ID.",
        },
        {
          key: "installationId",
          label: "Installation ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "87654321",
          description:
            "The numeric id of the installation to act as, from the installation's settings URL (…/settings/installations/<id>) or the installation_id query parameter of the post-install redirect.",
        },
        {
          key: "privateKey",
          label: "Private key (.pem)",
          inputType: "textarea",
          required: true,
          secret: true,
          placeholder: "-----BEGIN RSA PRIVATE KEY-----",
          description:
            "The full contents of the private key file generated on the GitHub App's settings page, an RSA key in PEM format. Escaped \\n line breaks are accepted.",
        },
      ],
    },
  ],
  homepageUrl: "https://github.com",
  actions: githubActions,
  triggers: [triggerSnapshot0_0, triggerSnapshot1_0],
  triggerPermissions,
};
