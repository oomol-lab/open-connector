import type { ProviderDefinition } from "../../core/types.ts";

import { salesloftActions } from "./actions.ts";

const service = "salesloft";

export const provider: ProviderDefinition = {
  service,
  displayName: "Salesloft",
  categories: ["Marketing", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "SALESLOFT_API_KEY",
      description:
        "Salesloft API key sent as an Authorization Bearer token. Create or view API keys in Salesloft Account > Your Applications > API Keys: https://accounts.salesloft.com/oauth/applications",
    },
  ],
  homepageUrl: "https://www.salesloft.com",
  actions: salesloftActions,
};
