import type { ProviderDefinition } from "../../core/types.ts";

import { anthropicAdminActions } from "./actions.ts";

const service = "anthropic_admin";

export const provider: ProviderDefinition = {
  service,
  displayName: "Anthropic Admin",
  categories: ["AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Admin API Key",
      placeholder: "ANTHROPIC_ADMIN_KEY",
      description:
        "Anthropic Admin API key sent with the x-api-key header. Create or manage Admin keys in the Anthropic Console: https://console.anthropic.com/settings/admin-keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.anthropic.com",
  actions: anthropicAdminActions,
};
