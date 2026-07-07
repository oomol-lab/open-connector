import type { ProviderDefinition } from "../../core/types.ts";

import { moesifActions } from "./actions.ts";

const service = "moesif";

export const provider: ProviderDefinition = {
  service,
  displayName: "Moesif",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Management API Token",
      placeholder: "MOESIF_MANAGEMENT_API_TOKEN",
      description:
        "Moesif Management API token sent as a Bearer token. Create or view management API tokens in Moesif settings: https://www.moesif.com/docs/api.",
    },
  ],
  homepageUrl: "https://www.moesif.com/",
  actions: moesifActions,
};
