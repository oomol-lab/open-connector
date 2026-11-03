import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "钉钉 MCP",
  description: "通过钉钉官方 MCP 广场中的服务发现和调用在线工具，例如钉钉文档、日历或通讯录。",
  auth: {
    custom_credential: {
      fields: {
        mcpUrl: {
          label: "MCP 地址",
          description:
            "钉钉 MCP 广场中某个服务的私密 Streamable HTTP 地址。登录钉钉后，在 MCP 广场（https://aihub.dingtalk.com/#/mcp-market/mcp）打开一个服务，点击“获取 MCP Server 配置”并复制地址。每个连接对应一个广场服务。官方指南：https://open.dingtalk.com/document/development/mcp-square-introduction。",
        },
      },
    },
  },
};
