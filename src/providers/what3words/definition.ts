import type { ProviderDefinition } from "../../core/types.ts";

import { what3wordsActions } from "./actions.ts";

const service = "what3words";

export const provider: ProviderDefinition = {
  service,
  displayName: "what3words",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WHAT3WORDS_API_KEY",
      description:
        "what3words API key sent as the key query parameter. Create or manage keys in the what3words developer console: https://developer.what3words.com/public-api.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://what3words.com",
  actions: what3wordsActions,
};
