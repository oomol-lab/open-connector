import type { ProviderDefinition } from "../../core/types.ts";

import { g2Actions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "g2",
  displayName: "G2",
  description: "Explore products, reviews and buying signals; manage Activate and research boards",
  homepageUrl: "https://www.g2.com",
  categories: ["Data & Analytics", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "G2 API Token",
      description:
        "Generate a User or Organization token at https://my.g2.com/developers under Access Tokens and enable the endpoint permissions you need. Tokens expire after one year. Data access depends on your G2 subscription; Activate unlocks spend credits. Connecting verifies the token with a one-record category query.",
    },
  ],
  actions: g2Actions,
};
