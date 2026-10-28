import type { ProviderDefinition } from "../../core/types.ts";

import actions from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "komos",
  displayName: "Komos",
  description: "Run saved automations and inspect their status, outputs and execution logs",
  homepageUrl: "https://komos.ai/",
  categories: ["Productivity", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Organization API Key",
      placeholder: "sk_live_...",
      description:
        "Create an organization API key in Komos Settings → API & Webhooks. Setup guide: https://docs.komos.ai/api-webhooks. The key is sent using Bearer authentication.",
    },
  ],
  actions,
};
