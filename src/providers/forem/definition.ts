import type { ProviderDefinition } from "../../core/types.ts";

import { foremActions } from "./actions.ts";

const service = "forem";

/**
 * Forem provider backed by API keys for DEV or self-hosted Forem communities.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Forem",
  categories: ["Social", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "forem_api_key",
      description:
        "Forem API key sent with the api-key header. For DEV, generate one from the DEV extensions settings page: https://dev.to/settings/extensions.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Forem base URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://dev.to",
          description:
            "The HTTPS origin for the Forem instance. Use https://dev.to for DEV, or the origin of your own Forem community.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.forem.com",
  actions: foremActions,
};
