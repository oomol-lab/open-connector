import type { ProviderDefinition } from "../../core/types.ts";

import { amplitudeActions } from "./actions.ts";

const service = "amplitude";

export const provider: ProviderDefinition = {
  service,
  displayName: "Amplitude",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret Key",
      placeholder: "AMPLITUDE_SECRET_KEY",
      description:
        "Amplitude project Secret Key used as the Basic Auth password for Dashboard REST API requests. Find it in Amplitude Settings > Projects > General > Secret Key: https://amplitude.com/docs/apis/authentication.",
      extraFields: [
        {
          key: "apiKeyId",
          label: "API Key",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "AMPLITUDE_API_KEY",
          description:
            "Amplitude project API Key used as the Basic Auth username. Find it in Amplitude Settings > Projects > General > API Key: https://amplitude.com/docs/apis/authentication.",
        },
        {
          key: "dataResidency",
          label: "Data Residency",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "default",
          description:
            "Optional Amplitude data residency region. Use default for amplitude.com or eu for analytics.eu.amplitude.com, as documented in the Dashboard REST API regions table: https://amplitude.com/docs/apis/analytics/dashboard-rest.",
        },
      ],
    },
  ],
  homepageUrl: "https://amplitude.com",
  actions: amplitudeActions,
};
