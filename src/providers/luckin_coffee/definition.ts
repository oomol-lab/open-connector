import type { ProviderDefinition } from "../../core/types.ts";

import { luckinCoffeeActions } from "./actions.ts";

const service = "luckin_coffee";

/**
 * Luckin Coffee provider backed by the official Streamable HTTP MCP service.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Luckin Coffee",
  description:
    "Find Luckin Coffee stores and products, preview orders, and manage orders through the official MCP service.",
  categories: ["Location", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "MCP Token",
      placeholder: "Paste your Luckin Coffee MCP token",
      description:
        "The Bearer token shared by Luckin Coffee MCP and CLI. Sign in and create or copy it at https://open.lkcoffee.com/mcp. Keep this token private because it is linked to your Luckin Coffee account session.",
    },
  ],
  homepageUrl: "https://open.lkcoffee.com/mcp",
  actions: luckinCoffeeActions,
};
