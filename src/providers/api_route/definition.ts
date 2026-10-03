import type { ProviderDefinition } from "../../core/types.ts";

import { apiRouteActions } from "./actions.ts";

/** API Route's OpenAI-compatible model gateway. */
export const provider: ProviderDefinition = {
  service: "api_route",
  displayName: "API Route",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk-...",
      description:
        "Create an API key at https://www.api-route.com/api-keys. Requests use Bearer authentication; inference requires account credit.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.api-route.com",
  actions: apiRouteActions,
};
