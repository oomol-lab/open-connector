import type { ProviderDefinition } from "../../core/types.ts";

import { weatherapiActions } from "./actions.ts";

const service = "weatherapi";

export const provider: ProviderDefinition = {
  service,
  displayName: "WeatherAPI",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WEATHERAPI_API_KEY",
      description:
        "WeatherAPI key passed as the key query parameter. Sign up at https://www.weatherapi.com/signup.aspx, then find your API key under your account.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.weatherapi.com",
  actions: weatherapiActions,
};
