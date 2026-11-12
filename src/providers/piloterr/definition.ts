import type { ProviderDefinition } from "../../core/types.ts";

import { piloterrActions } from "./actions.ts";

const service = "piloterr";

export const provider: ProviderDefinition = {
  service,
  displayName: "Piloterr",
  categories: ["Data", "Developer Tools", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "PILOTERR_API_KEY",
      description:
        "Piloterr API key sent with the x-api-key header. Create or copy it from your Piloterr dashboard: https://app.piloterr.com/",
    },
  ],
  homepageUrl: "https://www.piloterr.com",
  actions: piloterrActions,
};
