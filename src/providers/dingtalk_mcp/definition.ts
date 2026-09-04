import type { ProviderDefinition } from "../../core/types.ts";

import { dingTalkMcpActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "dingtalk_mcp",
  displayName: "DingTalk MCP",
  description:
    "Discover and call live DingTalk tools through an official DingTalk MCP marketplace service, such as DingTalk Docs, Calendar, or Contacts.",
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
          placeholder: "https://mcp-gw.dingtalk.com/mserver/...",
          description:
            "The secret Streamable HTTP URL of one DingTalk MCP marketplace service. Open a service on the DingTalk MCP marketplace (https://aihub.dingtalk.com/#/mcp-market/mcp, DingTalk login required), click 获取 MCP Server 配置 (Get MCP Server config), and copy the URL. Each connection exposes one marketplace service. Official guide: https://open.dingtalk.com/document/development/mcp-square-introduction.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.dingtalk.com",
  actions: dingTalkMcpActions,
};
