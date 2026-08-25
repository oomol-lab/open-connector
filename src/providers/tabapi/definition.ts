import type { ProviderDefinition } from "../../core/types.ts";

import { tabapiActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "tabapi",
  displayName: "TabAPI",
  categories: ["Data", "Marketing", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk_live_...",
      description:
        "TabAPI API key sent as an Authorization Bearer token. Create or manage keys at https://tabapi.com/settings/apikeys.",
    },
  ],
  homepageUrl: "https://tabapi.com",
  actions: tabapiActions,
};
