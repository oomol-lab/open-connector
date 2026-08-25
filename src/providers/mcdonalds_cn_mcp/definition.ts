import type { ProviderDefinition } from "../../core/types.ts";

import { mcdonaldsCnMcpActions } from "./actions.ts";

const service = "mcdonalds_cn_mcp";

/**
 * McDonald's China provider backed by the official Streamable HTTP MCP service.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "McDonald's China MCP",
  description:
    "Discover and use McDonald's China tools for stores, menus, ordering, coupons, campaigns, points, and the points mall through the official MCP service.",
  categories: ["Location", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "MCP Token",
      placeholder: "Paste your McDonald's China MCP Token",
      description:
        "The MCP Token sent to https://mcp.mcd.cn as an Authorization Bearer token. Sign in and activate MCP access at https://open.mcd.cn/mcp/doc, then copy the token from the console. Keep it private because it is linked to your McDonald's China account.",
    },
  ],
  homepageUrl: "https://open.mcd.cn/mcp/doc",
  actions: mcdonaldsCnMcpActions,
};
