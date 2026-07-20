import type { ProviderDefinition } from "../../core/types.ts";

import { anySearchActions } from "./actions.ts";

const service = "anysearch";

export const provider: ProviderDefinition = {
  service,
  displayName: "AnySearch",
  description: "Real-time web and vertical-domain search, batch search, and page extraction for AI agents.",
  categories: ["AI", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Enter your AnySearch API key",
      description:
        "AnySearch API key sent as a Bearer token. Create and manage keys in the AnySearch console: https://www.anysearch.com/console/api-keys.",
    },
  ],
  homepageUrl: "https://anysearch.com/home",
  actions: anySearchActions,
};
