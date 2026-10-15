import type { ProviderDefinition } from "../../core/types.ts";

import { twittrapiActions } from "./actions.ts";

const service = "twittrapi";

export const provider: ProviderDefinition = {
  service,
  displayName: "TwittrAPI",
  categories: ["Social", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "TWITTRAPI_API_KEY",
      description:
        "TwittrAPI key sent in the X-API-KEY header. Create or copy it in the TwittrAPI dashboard: https://app.twittrapi.com. API reference: https://twittrapi.com/docs.",
    },
  ],
  homepageUrl: "https://twittrapi.com",
  actions: twittrapiActions,
};
