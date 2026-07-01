import type { ProviderDefinition } from "../../core/types.ts";

import { anchorBrowserActions } from "./actions.ts";

const service = "anchor_browser";

export const provider: ProviderDefinition = {
  service,
  displayName: "Anchor Browser",
  categories: ["Developer Tools", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "anchor_api_key",
      description:
        "Anchor Browser API key sent in the anchor-api-key header. Create or manage API keys in Anchor project settings: https://app.anchorbrowser.io/",
      extraFields: [],
    },
  ],
  homepageUrl: "https://anchorbrowser.io",
  actions: anchorBrowserActions,
};
