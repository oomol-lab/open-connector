import type { ProviderDefinition } from "../../core/types.ts";

import { unifapiActions } from "./actions.ts";

const service = "unifapi";

export const provider: ProviderDefinition = {
  service,
  displayName: "UnifAPI",
  categories: ["AI", "Data", "Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "UNIFAPI_API_KEY",
      description:
        "UnifAPI API key used with the Authorization: Bearer <apiKey> header. Sign in and create an API key in the UnifAPI dashboard: https://api.unifapi.com/sign-in.",
    },
  ],
  homepageUrl: "https://unifapi.com",
  actions: unifapiActions,
};
