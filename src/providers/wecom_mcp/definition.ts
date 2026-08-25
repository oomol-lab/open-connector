import type { ProviderDefinition } from "../../core/types.ts";

import { wecomMcpActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "wecom_mcp",
  displayName: "WeCom MCP",
  categories: ["Communication", "Productivity", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "mcpUrl",
          label: "MCP URL",
          required: true,
          inputType: "password",
          secret: true,
          placeholder: "https://qyapi.weixin.qq.com/...",
          description: "The secret Streamable HTTP URL copied from a WeCom API-mode bot permission page.",
        },
      ],
    },
  ],
  homepageUrl: "https://work.weixin.qq.com",
  actions: wecomMcpActions,
};
