import type { ProviderDefinition } from "../../core/types.ts";

import { demodeskActions } from "./actions.ts";

const service = "demodesk";

export const provider: ProviderDefinition = {
  service,
  displayName: "Demodesk",
  categories: ["Productivity", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DEMODESK_API_KEY",
      description:
        "Demodesk API key sent as a Bearer token. Generate one in Demodesk under Settings > Integrations > Other, as described in the official API reference: https://demodesk.com/api/docs/index.html",
    },
  ],
  homepageUrl: "https://demodesk.com",
  actions: demodeskActions,
};
