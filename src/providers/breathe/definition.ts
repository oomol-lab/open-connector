import type { ProviderDefinition } from "../../core/types.ts";

import { breatheActions } from "./actions.ts";

const service = "breathe";

export const provider: ProviderDefinition = {
  service,
  displayName: "Breathe",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "breathe_api_key",
      description:
        "Breathe API key sent with the X-API-KEY header. Find it in Breathe under Configure > Settings > API setup, also available at /account/api_setup after signing in.",
    },
  ],
  homepageUrl: "https://www.breathehr.com/",
  actions: breatheActions,
};
