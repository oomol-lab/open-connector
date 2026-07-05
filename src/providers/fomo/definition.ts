import type { ProviderDefinition } from "../../core/types.ts";

import { fomoActions } from "./actions.ts";

const service = "fomo";

export const provider: ProviderDefinition = {
  service,
  displayName: "Fomo",
  categories: ["Marketing", "Social"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Auth Token",
      placeholder: "FOMO_AUTH_TOKEN",
      description:
        "Fomo auth token sent with the Authorization: Token <token> header. Find it in Fomo under Settings > Site for a selected website: https://docs.fomo.com/reference/fomo-api-auth-token",
      extraFields: [],
    },
  ],
  homepageUrl: "https://fomo.com",
  actions: fomoActions,
};
