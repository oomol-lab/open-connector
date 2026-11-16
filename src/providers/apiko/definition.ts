import type { ProviderDefinition } from "../../core/types.ts";

import { apikoActions } from "./actions.ts";

/** APIKO's OpenAI-compatible model API. */
export const provider: ProviderDefinition = {
  service: "apiko",
  displayName: "APIKO",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk-...",
      description:
        "Create an API key at https://apiko.app/dashboard/apikeys. Requests use Bearer authentication; usage is billed per request from a prepaid balance.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://apiko.app",
  actions: apikoActions,
};
