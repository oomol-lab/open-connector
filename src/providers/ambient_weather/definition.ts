import type { ProviderDefinition } from "../../core/types.ts";

import { ambientWeatherActions } from "./actions.ts";

const service = "ambient_weather";

export const provider: ProviderDefinition = {
  service,
  displayName: "Ambient Weather",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ambient_api_key",
      description:
        "Ambient Weather API key sent as the apiKey query parameter. Create it from your Ambient Weather account page: https://ambientweather.net/account.",
      extraFields: [
        {
          key: "applicationKey",
          label: "Application Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "ambient_application_key",
          description:
            "Ambient Weather application key sent as the applicationKey query parameter. Create it from your Ambient Weather account page: https://ambientweather.net/account.",
        },
      ],
    },
  ],
  homepageUrl: "https://ambientweather.net/",
  actions: ambientWeatherActions,
};
