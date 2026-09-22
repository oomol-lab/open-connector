import type { ProviderDefinition } from "../../core/types.ts";

import { speakAiActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "speak_ai",
  displayName: "Speak AI",
  description: "Submit and inspect media transcription and analysis jobs with Speak AI.",
  categories: ["AI", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "SPEAK_AI_API_KEY",
      description:
        "Speak AI API key used to obtain short-lived access tokens. Generate or manage keys at https://app.speakai.co/developers/apikeys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://speakai.co",
  actions: speakAiActions,
};
