import type { ProviderDefinition } from "../../core/types.ts";

import { webflowActions } from "./actions.ts";

const service = "webflow";

export const provider: ProviderDefinition = {
  service,
  displayName: "Webflow",
  categories: ["Design & Media", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "WEBFLOW_API_TOKEN",
      description:
        "Webflow Data API token sent as a Bearer token. Create or manage API tokens from Webflow Apps & Integrations: https://app.webflow.com/dashboard/apps.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://webflow.com",
  actions: webflowActions,
};
