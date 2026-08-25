import type { ProviderDefinition } from "../../core/types.ts";

import { waiverFileActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "waiverfile",
  displayName: "WaiverFile",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WAIVERFILE_API_KEY",
      description: "WaiverFile API key sent with each request. Create or view it under Settings > API > API keys.",
      extraFields: [
        {
          key: "siteId",
          label: "Site ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "WAIVERFILE_SITE_ID",
          description: "WaiverFile Site ID paired with the API key.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.waiverfile.com",
  actions: waiverFileActions,
};
