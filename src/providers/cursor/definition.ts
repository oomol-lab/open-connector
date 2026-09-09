import type { ProviderDefinition } from "../../core/types.ts";

import { cursorActions } from "./actions.ts";

const service = "cursor";

export const provider: ProviderDefinition = {
  service,
  displayName: "Cursor",
  description: "Run coding agents, continue conversations, and track team usage and spending.",
  categories: ["Developer Tools", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "crsr_...",
      description:
        "Create a user API key at https://cursor.com/dashboard/api, or use a service account or admin API key from your team settings.",
    },
  ],
  homepageUrl: "https://cursor.com",
  actions: cursorActions,
};
