import type { ProviderDefinition } from "../../core/types.ts";

import { pingbellActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "pingbell",
  displayName: "PingBell",
  description: "List PingBell sources and send counter notifications.",
  categories: ["Communication", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "PINGBELL_API_KEY",
      description:
        "PingBell API key sent in the x-api-key header. Copy it from PingBell Settings: https://pingbell.io/knowledge-base/account-billing/getting-your-api-key/",
    },
  ],
  homepageUrl: "https://pingbell.io",
  actions: pingbellActions,
};
