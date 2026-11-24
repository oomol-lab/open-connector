import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "企业微信 MCP",
  description:
    "通过企业微信 API 模式机器人的 MCP 地址发现和调用在线企业微信工具。如需发送群 webhook 消息或使用固定的智能机器人操作，请使用企业微信机器人。",
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
