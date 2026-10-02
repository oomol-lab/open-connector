import type { ProviderDefinition } from "../../core/types.ts";

import { huodingdongMcpActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "huodingdong_mcp",
  displayName: "Huodingdong ERP MCP",
  homepageUrl: "https://www.huodingdong.com",
  iconUrl: "https://imghdd.huohanhan.com/common/1015607879169744896.png",
  categories: ["Cross-border E-commerce", "Data & Analytics", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "X-Mcp-Key",
      placeholder: "Paste your Huodingdong MCP access key",
      description:
        "Sign in at https://www.huodingdong.com/login, open System > Open Platform > MCP Management, and copy the access key. The key is bound to your Huodingdong account and inherits its shop and data permissions. Revoke and reissue an exposed key in MCP Management.",
    },
  ],
  actions: huodingdongMcpActions,
};
