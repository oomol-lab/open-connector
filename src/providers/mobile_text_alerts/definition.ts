import type { ProviderDefinition } from "../../core/types.ts";

import { mobileTextAlertsActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "mobile_text_alerts",
  displayName: "Mobile Text Alerts",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "MTA_API_KEY",
      description:
        "Mobile Text Alerts API key sent as a Bearer token. Generate it under Settings > Developer Resources: https://platform.mobile-text-alerts.com#settings_developer",
    },
  ],
  homepageUrl: "https://mobile-text-alerts.com",
  actions: mobileTextAlertsActions,
};
