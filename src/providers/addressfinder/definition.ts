import type { ProviderDefinition } from "../../core/types.ts";

import { addressfinderActions } from "./actions.ts";

const service = "addressfinder";

export const provider: ProviderDefinition = {
  service,
  displayName: "Addressfinder",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ADDRESSFINDER_API_KEY",
      description:
        "Addressfinder API key sent as the key query parameter. Find it in your Addressfinder Portal project credentials: https://portal.addressfinder.net/.",
      extraFields: [
        {
          key: "apiSecret",
          label: "API Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "ADDRESSFINDER_API_SECRET",
          description:
            "Addressfinder API secret sent in the Authorization header for server-to-server requests. Find it with the API key in your Addressfinder Portal project credentials: https://portal.addressfinder.net/.",
        },
      ],
    },
  ],
  homepageUrl: "https://addressfinder.com/au",
  actions: addressfinderActions,
};
