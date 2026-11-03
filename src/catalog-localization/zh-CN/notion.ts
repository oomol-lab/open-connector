import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  auth: {
    api_key: {
      label: "内部集成密钥",
      description:
        "通过 Authorization Bearer 请求头使用 Notion 内部集成密钥。在 Creator dashboard 创建内部集成并复制密钥，然后向该集成共享目标页面或数据库。配置指南：https://developers.notion.com/guides/connections-and-tokens/internal-connections。",
    },
  },
};
