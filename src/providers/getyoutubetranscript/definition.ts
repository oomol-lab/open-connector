import type { ProviderDefinition } from "../../core/types.ts";

import { getyoutubetranscriptActions } from "./actions.ts";

const service = "getyoutubetranscript";

export const provider: ProviderDefinition = {
  service,
  displayName: "GetYouTubeTranscript",
  categories: ["AI", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "GETYOUTUBETRANSCRIPT_API_KEY",
      description:
        "GetYouTubeTranscript API key sent as a Bearer token. Create a key in your dashboard: https://getyoutubetranscript.com/dashboard",
    },
  ],
  homepageUrl: "https://getyoutubetranscript.com/",
  actions: getyoutubetranscriptActions,
};
