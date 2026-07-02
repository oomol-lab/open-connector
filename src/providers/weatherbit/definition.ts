import type { ProviderDefinition } from "../../core/types.ts";

import { weatherbitActions } from "./actions.ts";

const service = "weatherbit";

export const provider: ProviderDefinition = {
  service,
  displayName: "Weatherbit",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WEATHERBIT_API_KEY",
      description:
        "Weatherbit API key sent as the key query parameter. Sign up or log in at https://www.weatherbit.io/account/create, then use the API key shown in the account dashboard.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.weatherbit.io",
  actions: weatherbitActions,
};
