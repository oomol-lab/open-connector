import type { ProviderDefinition } from "../../core/types.ts";

import { alchemyActions } from "./actions.ts";

const service = "alchemy";

export const provider: ProviderDefinition = {
  service,
  displayName: "Alchemy",
  categories: ["Developer Tools", "Data", "Finance"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ALCHEMY_API_KEY",
      description:
        "Alchemy API key used with the Authorization: Bearer header. Copy it from your app details page in the Alchemy Dashboard, as shown in the official guide: https://www.alchemy.com/docs/create-an-api-key.",
    },
  ],
  homepageUrl: "https://www.alchemy.com",
  actions: alchemyActions,
};
