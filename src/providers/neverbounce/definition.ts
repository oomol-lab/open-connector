import type { ProviderDefinition } from "../../core/types.ts";

import { neverbounceActions } from "./actions.ts";

const service = "neverbounce";

export const provider: ProviderDefinition = {
  service,
  displayName: "NeverBounce",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "NEVERBOUNCE_API_KEY",
      description:
        "NeverBounce API key passed with the key query or form parameter. Create a Custom Integration App to get one: https://developers.neverbounce.com/docs/api-getting-started.",
    },
  ],
  homepageUrl: "https://neverbounce.com",
  actions: neverbounceActions,
};
