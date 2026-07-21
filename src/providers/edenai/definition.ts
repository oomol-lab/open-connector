import type { ProviderDefinition } from "../../core/types.ts";

import { edenaiActions } from "./actions.ts";

const service = "edenai";

export const provider: ProviderDefinition = {
  service,
  displayName: "Eden AI",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "Eden AI API key used with the Authorization Bearer header. Create or manage keys in your Eden AI account at https://app.edenai.run/v2/settings/api.",
    },
  ],
  homepageUrl: "https://www.edenai.co",
  actions: edenaiActions,
};
