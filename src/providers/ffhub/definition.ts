import type { ProviderDefinition } from "../../core/types.ts";

import { ffhubActions } from "./actions.ts";

const service = "ffhub";

/**
 * FFHub provider backed by the public FFHub API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "FFHub",
  categories: ["Media", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ffhub_api_key",
      description:
        "FFHub API key sent with the Authorization Bearer header. Create and manage it in FFHub Settings > API Keys: https://ffhub.io/settings/apikeys",
    },
  ],
  homepageUrl: "https://ffhub.io",
  actions: ffhubActions,
};
