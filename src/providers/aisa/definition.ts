import type { ProviderDefinition } from "../../core/types.ts";

import { aisaActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "aisa",
  displayName: "AIsa",
  description:
    "Query AIsa prediction markets, web intelligence, financial data, crypto markets, public social data, and company and creator databases.",
  categories: ["Data", "Finance"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk-aisa-...",
      description:
        "AIsa API key sent as a Bearer token. Create and copy a key from the API Keys page at https://console.aisa.one.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://aisa.one",
  actions: aisaActions,
};
