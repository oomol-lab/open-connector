import type { ProviderDefinition } from "../../core/types.ts";

import { knockActions } from "./actions.ts";

const service = "knock";

export const provider: ProviderDefinition = {
  service,
  displayName: "Knock",
  categories: ["Communication", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret API Key",
      placeholder: "sk_...",
      description:
        "Knock secret API key sent as a Bearer token. Create or copy it from the Knock dashboard API keys page: https://dashboard.knock.app/developer-tools/api-keys.",
    },
  ],
  homepageUrl: "https://knock.app/",
  actions: knockActions,
};
