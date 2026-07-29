import type { ProviderDefinition } from "../../core/types.ts";

import { keepaActions } from "./actions.ts";

const service = "keepa";

export const provider: ProviderDefinition = {
  service,
  displayName: "Keepa",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Access Key",
      placeholder: "KEEPA_API_KEY",
      description:
        "Private Keepa API access key passed as the key query parameter. Subscribe to Keepa Data Access and view your key at https://keepa.com/#!api.",
    },
  ],
  homepageUrl: "https://keepa.com",
  actions: keepaActions,
};
