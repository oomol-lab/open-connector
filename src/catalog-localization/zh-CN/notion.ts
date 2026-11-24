import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  description:
    "通过 Notion API 使用 Notion：提供页面、块、数据库和用户的类型化操作，以及数据库页面事件触发器。如需使用 Notion 官方工具，请使用 Notion MCP。",
  auth: {
    api_key: {
      label: "内部集成密钥",
      description:
        "通过 Authorization Bearer 请求头使用 Notion 内部集成密钥。在 Creator dashboard 创建内部集成并复制密钥，然后向该集成共享目标页面或数据库。配置指南：https://developers.notion.com/guides/connections-and-tokens/internal-connections。",
    },
  },
};
