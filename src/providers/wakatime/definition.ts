import type { ProviderDefinition } from "../../core/types.ts";

import { wakatimeActions } from "./actions.ts";

const service = "wakatime";

export const provider: ProviderDefinition = {
  service,
  displayName: "WakaTime",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "waka_...",
      description:
        "WakaTime API key used with the Authorization Basic header. Retrieve it from your account settings at https://wakatime.com/api-key.",
    },
  ],
  homepageUrl: "https://wakatime.com",
  actions: wakatimeActions,
};
