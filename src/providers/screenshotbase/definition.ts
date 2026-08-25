import type { ProviderDefinition } from "../../core/types.ts";

import { screenshotbaseActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "screenshotbase",
  displayName: "screenshotbase",
  categories: ["Developer Tools", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "SCREENSHOTBASE_API_KEY",
      description: "screenshotbase API key.",
    },
  ],
  homepageUrl: "https://screenshotbase.com",
  actions: screenshotbaseActions,
};
