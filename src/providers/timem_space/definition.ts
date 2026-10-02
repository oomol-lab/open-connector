import type { ProviderDefinition } from "../../core/types.ts";

import { timemSpaceActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "timem_space",
  displayName: "TiMEM Space",
  homepageUrl: "https://space.timem.cloud",
  iconUrl: "https://space.timem.cloud/favicon.ico",
  categories: ["AI", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "tmk_...",
      description:
        "TiMEM Space Agent API Key used to connect its hosted MCP service. Sign in at https://space.timem.cloud/console/connections, connect an Agent, and copy the generated API Key.",
    },
  ],
  actions: timemSpaceActions,
};
