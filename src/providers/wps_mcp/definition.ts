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
      label: "WPS Access Token",
      placeholder: "Paste your WPS MCP access token",
      description:
        "Access Token sent to WPS MCP as an Authorization bearer token. Sign in and copy the Token from https://account.wps.cn/usercenter/agent-identity?isclient=false.",
    },
  ],
  homepageUrl: "https://www.wps.cn",
  actions: wpsMcpActions,
};
