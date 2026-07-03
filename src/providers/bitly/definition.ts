import type { ProviderDefinition } from "../../core/types.ts";

import { bitlyActions } from "./actions.ts";

const service = "bitly";

export const provider: ProviderDefinition = {
  service,
  displayName: "Bitly",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Generic Access Token",
      placeholder: "BITLY_ACCESS_TOKEN",
      description:
        "Bitly generic access token sent as a Bearer token. Generate it in Bitly Developer settings: https://app.bitly.com/settings/api/.",
    },
  ],
  homepageUrl: "https://bitly.com",
  actions: bitlyActions,
};
