import type { ProviderDefinition } from "../../core/types.ts";

import { mintlifyActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "mintlify",
  displayName: "Mintlify",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Admin API Key",
      placeholder: "mint_...",
      description:
        "Mintlify admin API key used as a Bearer token. Create one at https://app.mintlify.com/settings/organization/api-keys.",
      extraFields: [
        {
          key: "projectId",
          label: "Project ID",
          required: true,
          secret: false,
          inputType: "text",
          placeholder: "your-project-id",
          description: "A Mintlify project ID used to validate the admin API key.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.mintlify.com",
  actions: mintlifyActions,
};
