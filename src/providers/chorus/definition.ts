import type { ProviderDefinition } from "../../core/types.ts";

import { chorusActions } from "./actions.ts";

const service = "chorus";

export const provider: ProviderDefinition = {
  service,
  displayName: "Chorus",
  categories: ["Communication", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "abcdefghijklmnopqrstuvwxyz0123456789",
      description:
        "Chorus API token sent as the raw Authorization header value. Generate it from Personal Settings in the Chorus application after your role has API access.",
    },
  ],
  homepageUrl: "https://www.chorus.ai",
  actions: chorusActions,
};
