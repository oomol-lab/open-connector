import type { ProviderDefinition } from "../../core/types.ts";

import { activeTrailActions } from "./actions.ts";

const service = "active_trail";

export const provider: ProviderDefinition = {
  service,
  displayName: "ActiveTrail",
  categories: ["Marketing", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "active_trail_api_token",
      description:
        "ActiveTrail API token used as the Authorization request header. Create a token in the ActiveTrail web interface under Settings > API Apps, as described in the official API guide: https://webapi.mymarketing.co.il/api/docs/Guides",
    },
  ],
  homepageUrl: "https://www.activetrail.com/",
  actions: activeTrailActions,
};
