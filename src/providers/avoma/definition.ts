import type { ProviderDefinition } from "../../core/types.ts";

import { avomaActions } from "./actions.ts";

const service = "avoma";

export const provider: ProviderDefinition = {
  service,
  displayName: "Avoma",
  categories: ["AI", "Communication", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "CLIENT_KEY:CLIENT_SECRET",
      description:
        "Avoma API key sent as a Bearer token. Admins can create or copy scoped API keys in Avoma under Settings > Organization > Developer: https://help.avoma.com/api-integration-for-avoma.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.avoma.com/",
  actions: avomaActions,
};
