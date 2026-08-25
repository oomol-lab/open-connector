import type { ProviderDefinition } from "../../core/types.ts";

import { skyvernActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "skyvern",
  displayName: "Skyvern",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "YOUR_SKYVERN_API_KEY",
      description:
        "Skyvern API key sent in the x-api-key header. Reveal or copy it at https://app.skyvern.com/settings.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.skyvern.com",
  actions: skyvernActions,
};
