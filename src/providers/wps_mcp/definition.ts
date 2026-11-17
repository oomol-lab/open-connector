import type { ProviderDefinition } from "../../core/types.ts";

import { wpsMcpActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "wps_mcp",
  displayName: "WPS MCP",
  description: "Search, inspect, read, and create WPS cloud files through the official WPS MCP service.",
  categories: ["Productivity", "Storage"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Token",
      placeholder: "Paste your Token",
      description:
        "Sign in at https://www.kdocs.cn/latest, open the menu in the upper-right corner, select Kingsoft Docs Skill, then choose Copy token only in the dialog. Paste the Token here without the Bearer prefix.",
    },
  ],
  homepageUrl: "https://www.wps.cn",
  actions: wpsMcpActions,
};
