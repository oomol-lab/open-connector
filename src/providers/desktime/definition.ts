import type { ProviderDefinition } from "../../core/types.ts";

import { desktimeActions } from "./actions.ts";

const service = "desktime";

export const provider: ProviderDefinition = {
  service,
  displayName: "DeskTime",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DESKTIME_API_KEY",
      description:
        "DeskTime API key passed as the apiKey query parameter. Create or view it from the DeskTime API settings page linked in the official API introduction: https://help.desktime.com/hc/en-us/articles/25494558790685-Introduction-to-the-DeskTime-API",
    },
  ],
  homepageUrl: "https://desktime.com/",
  actions: desktimeActions,
};
