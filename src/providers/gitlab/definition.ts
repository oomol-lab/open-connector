import type { ProviderDefinition } from "../../core/types.ts";

import { gitlabActions } from "./actions.ts";

const service = "gitlab";

/**
 * GitLab provider backed by the GitLab REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "GitLab",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal access token",
      placeholder: "glpat-xxxxxxxxxxxxxxxxxxxx",
      description:
        "GitLab personal access token sent with the PRIVATE-TOKEN header. Create one in GitLab user preferences under Access tokens.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://gitlab.example.com",
          description:
            "Optional base URL of a self-hosted GitLab instance, without the /api/v4 path. Leave empty for GitLab.com. Private/overlay targets (RFC 1918, Tailscale, NetBird, private hostnames) require the self-hosted runtime to enable OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK.",
        },
      ],
    },
  ],
  homepageUrl: "https://gitlab.com",
  actions: gitlabActions,
};
