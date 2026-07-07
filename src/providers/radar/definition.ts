import type { ProviderDefinition } from "../../core/types.ts";

import { radarActions } from "./actions.ts";

const service = "radar";

export const provider: ProviderDefinition = {
  service,
  displayName: "Radar",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "RADAR_API_KEY",
      description:
        "Radar API key sent in the Authorization header. Find publishable and secret API keys on the Radar Settings page: https://dashboard.radar.com/settings",
    },
  ],
  homepageUrl: "https://radar.com",
  actions: radarActions,
};
