import type { ProviderDefinition } from "../../core/types.ts";

import { sherpaActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "sherpa",
  displayName: "Sherpa",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "SHERPA_API_KEY",
      description: "Sherpa Requirements API key. Request access at https://www.joinsherpa.com/contact-business.",
    },
  ],
  homepageUrl: "https://www.joinsherpa.com",
  actions: sherpaActions,
};
