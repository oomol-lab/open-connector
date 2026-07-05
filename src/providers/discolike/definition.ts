import type { ProviderDefinition } from "../../core/types.ts";

import { discolikeActions } from "./actions.ts";

const service = "discolike";

/**
 * DiscoLike provider backed by the public company discovery and enrichment API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "DiscoLike",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DISCOLIKE_API_KEY",
      description:
        "DiscoLike API key sent as the X-API-Key header. Create or manage keys from the DiscoLike account keys page: https://app.discolike.com/account/management/keys.",
    },
  ],
  homepageUrl: "https://discolike.com/",
  actions: discolikeActions,
};
