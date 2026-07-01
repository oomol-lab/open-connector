import type { ProviderDefinition } from "../../core/types.ts";

import { apiNinjasActions } from "./actions.ts";

const service = "api_ninjas";

export const provider: ProviderDefinition = {
  service,
  displayName: "API Ninjas",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "api_ninjas_api_key",
      description:
        "API Ninjas API key used with the X-Api-Key header. Sign up for a key or find it from the official API docs: https://api-ninjas.com/api.",
    },
  ],
  homepageUrl: "https://api-ninjas.com",
  actions: apiNinjasActions,
};
