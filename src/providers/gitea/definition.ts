import type { ProviderDefinition } from "../../core/types.ts";

import { giteaActions } from "./actions.ts";

const service = "gitea";

/**
 * Gitea provider backed by a user-configured Gitea instance.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Gitea",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "gitea_pat_xxx",
      description:
        "Gitea personal access token. Create it in User Settings > Applications > Manage Access Tokens on your Gitea instance, as documented at https://docs.gitea.com/development/api-usage",
      extraFields: [
        {
          key: "baseUrl",
          label: "Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://gitea.example.com",
          description:
            "Gitea instance base URL, such as https://gitea.com or your self-hosted domain. URLs ending in /api/v1 are also accepted. Private/overlay targets and plain HTTP require the self-hosted runtime to enable OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK.",
        },
      ],
    },
  ],
  homepageUrl: "https://about.gitea.com/products/gitea/",
  actions: giteaActions,
};
