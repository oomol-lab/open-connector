import type { ProviderDefinition } from "../../core/types.ts";

import { anyapiActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "anyapi",
  displayName: "AnyAPI",
  description: "Public commerce, social, travel and business data through your AnyAPI account",
  homepageUrl: "https://getanyapi.com",
  categories: ["Data & Analytics", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "aa_live_...",
      description:
        "Create an API key in the API Keys section at https://getanyapi.com/dashboard/keys. Use a key that permits wallet reads and business runs. Calls are charged to your own AnyAPI wallet.",
    },
  ],
  actions: anyapiActions,
};
