import type { ProviderDefinition } from "../../core/types.ts";

import { folkActions } from "./actions.ts";

const service = "folk";

/**
 * folk provider backed by the folk REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "folk",
  categories: ["Productivity", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FOLK_API_KEY",
      description:
        "Folk API key sent with the Authorization: Bearer header. Create and manage it in your workspace API settings: https://app.folk.app/apps/contacts/network/settings/api-keys",
    },
  ],
  homepageUrl: "https://folk.app",
  actions: folkActions,
};
