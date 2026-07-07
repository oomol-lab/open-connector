import type { ProviderDefinition } from "../../core/types.ts";

import { dubActions } from "./actions.ts";

const service = "dub";

export const provider: ProviderDefinition = {
  service,
  displayName: "Dub",
  categories: ["Marketing", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "dub_xxxxxx",
      description:
        "Dub API key sent as a Bearer token in the Authorization header. Create or view API keys in the Dub workspace settings: https://dub.co/docs/api-reference/authentication#api-keys.",
    },
  ],
  homepageUrl: "https://dub.co",
  actions: dubActions,
};
