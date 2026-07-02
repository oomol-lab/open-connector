import type { ProviderDefinition } from "../../core/types.ts";

import { wappalyzerActions } from "./actions.ts";

const service = "wappalyzer";

export const provider: ProviderDefinition = {
  service,
  displayName: "Wappalyzer",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WAPPALYZER_API_KEY",
      description:
        "Wappalyzer API key sent as the x-api-key header. Create or copy an API key from the Wappalyzer API dashboard: https://www.wappalyzer.com/app/api-key/",
    },
  ],
  homepageUrl: "https://www.wappalyzer.com/",
  actions: wappalyzerActions,
};
