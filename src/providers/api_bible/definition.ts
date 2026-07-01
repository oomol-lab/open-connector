import type { ProviderDefinition } from "../../core/types.ts";

import { apiBibleActions } from "./actions.ts";

const service = "api_bible";

export const provider: ProviderDefinition = {
  service,
  displayName: "API.Bible",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "API_BIBLE_API_KEY",
      description:
        "API.Bible API key sent with the api-key request header. After approval, copy it from your credentials page: https://scripture.api.bible/admin/applications",
    },
  ],
  homepageUrl: "https://scripture.api.bible/",
  actions: apiBibleActions,
};
