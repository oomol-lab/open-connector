import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "企业微信 MCP",
  auth: {
    custom_credential: {
      fields: {
        mcpUrl: {
          label: "MCP 地址",
          description: "从企业微信 API 模式机器人的权限页面复制的私密 Streamable HTTP 地址。",
        },
      },
    },
  },
};
