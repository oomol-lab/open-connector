import type { ProviderDefinition } from "../../core/types.ts";

import { blazeMeterPerformanceActions } from "./actions.ts";

const service = "blaze_meter_performance";

export const provider: ProviderDefinition = {
  service,
  displayName: "BlazeMeter Performance",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Secret",
      placeholder: "BLAZEMETER_API_SECRET",
      description:
        "BlazeMeter API secret used as the Basic Auth password. Create or copy API keys from the BlazeMeter API Keys settings page: https://a.blazemeter.com/app/#/settings/api-keys.",
      extraFields: [
        {
          key: "apiKeyId",
          label: "API Key ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "BLAZEMETER_API_KEY_ID",
          description:
            "BlazeMeter API key ID used as the Basic Auth username. Create or copy API keys from the BlazeMeter API Keys settings page: https://a.blazemeter.com/app/#/settings/api-keys.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.blazemeter.com/",
  actions: blazeMeterPerformanceActions,
};
