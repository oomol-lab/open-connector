import type { ProviderDefinition } from "../../core/types.ts";

import { happyScribeActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "happy_scribe",
  displayName: "Happy Scribe",
  categories: ["AI", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "HAPPY_SCRIBE_API_KEY",
      description:
        "Happy Scribe API key sent as a Bearer token. Get it from the API section of your account at https://www.happyscribe.com/account.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.happyscribe.com/",
  actions: happyScribeActions,
};
