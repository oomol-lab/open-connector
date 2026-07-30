import type { ProviderDefinition } from "../../core/types.ts";

import { minimaxActions } from "./actions.ts";

const service = "minimax";

export const provider: ProviderDefinition = {
  service,
  displayName: "MiniMax",
  categories: ["AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "MINIMAX_API_KEY",
      description:
        "MiniMax API key sent as an Authorization Bearer token. Create or view global keys at https://platform.minimax.io/user-center/basic-information/interface-key or China keys at https://platform.minimaxi.com/user-center/basic-information/interface-key.",
      extraFields: [
        {
          key: "region",
          label: "Region",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "global",
          description:
            "Optional MiniMax API region for this key. Use global for api.minimax.io or china for api.minimaxi.com.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.minimax.io",
  actions: minimaxActions,
};
