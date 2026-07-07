import type { ProviderDefinition } from "../../core/types.ts";

import { deepgramActions } from "./actions.ts";

const service = "deepgram";

export const provider: ProviderDefinition = {
  service,
  displayName: "Deepgram",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DEEPGRAM_API_KEY",
      description:
        "Deepgram API key sent as Authorization: Token <API_KEY>. Create or manage keys in the Deepgram Console and API key guide: https://developers.deepgram.com/docs/create-additional-api-keys.",
    },
  ],
  homepageUrl: "https://deepgram.com/",
  actions: deepgramActions,
};
