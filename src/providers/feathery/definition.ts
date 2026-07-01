import type { ProviderDefinition } from "../../core/types.ts";

import { featheryActions } from "./actions.ts";

const service = "feathery";

/**
 * Feathery provider backed by the public Feathery API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Feathery",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FEATHERY_API_KEY",
      description:
        "Feathery API key sent as Authorization: Token <key>. View and manage API keys in Feathery developer settings: https://docs.feathery.io/developers/api.",
    },
  ],
  homepageUrl: "https://www.feathery.io/",
  actions: featheryActions,
};
