import type { ProviderDefinition } from "../../core/types.ts";

import actions from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "planyo",
  displayName: "Planyo",
  description: "Inspect booking sites, resources and resource settings",
  homepageUrl: "https://www.planyo.com/",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "PLANYO_API_KEY",
      description:
        "Create a Planyo API key at https://www.planyo.com/api-key.php. Allow get_site_info for connection validation and the methods you intend to call.",
      extraFields: [
        {
          key: "hashKey",
          inputType: "text",
          label: "Hash key",
          required: false,
          secret: true,
          description:
            "If hash protection is enabled, copy the secret hash key from your API key details at https://www.planyo.com/api-key.php.",
        },
        {
          key: "siteId",
          secret: false,
          inputType: "text",
          label: "Site ID",
          required: false,
          description:
            "For a metasite key, enter a member site ID for connection validation. Find it in your Planyo administration panel.",
        },
      ],
    },
  ],
  actions,
};
