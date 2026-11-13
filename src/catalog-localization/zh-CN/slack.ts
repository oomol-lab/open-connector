import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  auth: {
    api_key: {
      label: "访问令牌",
      placeholder: "xoxb-... 或 xoxp-...",
      description:
        "通过 Authorization Bearer 请求头使用 Slack 机器人令牌或用户令牌。创建 Slack 应用并将其安装到工作区，然后从 OAuth & Permissions 页面复制机器人令牌或用户令牌。",
    },
    oauth2: {
      authorizationOptions: {
        "search:read.public": {
          label: "搜索公开频道",
          description: "适用于内部应用或已上架 Slack Marketplace 的应用。",
        },
        "search:read.private": {
          label: "搜索私有频道",
          description: "搜索你有权访问的私有频道消息，需在 Slack 内确认授权。",
        },
      },
    },
  },
};
