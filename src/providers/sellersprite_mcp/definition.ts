import type { ProviderDefinition } from "../../core/types.ts";

import { sellerspriteMcpActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "sellersprite_mcp",
  displayName: "SellerSprite MCP",
  description:
    "SellerSprite through its MCP service: typed tools for ASINs, reviews, keywords, categories and ads, plus live tools. With an Open API key, use SellerSprite.",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "MCP Secret Key",
      placeholder: "Paste your SellerSprite MCP secret key",
      description:
        "Activate your MCP service and copy its Secret Key at https://open.sellersprite.com/app/list, then paste it here.",
    },
  ],
  homepageUrl: "https://open.sellersprite.com/mcp",
  actions: sellerspriteMcpActions,
};
