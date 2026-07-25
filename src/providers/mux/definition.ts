import type { ProviderDefinition } from "../../core/types.ts";

import { muxActions } from "./actions.ts";

const service = "mux";

/**
 * Mux provider backed by the public Mux Video API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Mux",
  description: "Create, inspect, publish, and delete on-demand video assets with Mux Video.",
  categories: ["Video", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Token Secret",
      placeholder: "MUX_TOKEN_SECRET",
      description:
        "Mux access token secret used as the HTTP Basic Auth password. Create a token in the Mux Dashboard under Settings > Access Tokens: https://dashboard.mux.com/settings/access-tokens.",
      extraFields: [
        {
          key: "tokenId",
          label: "Token ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "MUX_TOKEN_ID",
          description:
            "Mux access token ID used as the HTTP Basic Auth username. Copy it together with the token secret from the Mux Dashboard.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.mux.com/",
  actions: muxActions,
};
