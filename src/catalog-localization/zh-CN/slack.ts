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
          label: "公开频道消息搜索",
          description: "使用 Slack Real-time Search 搜索公开频道的消息，需要 Slack 单独批准。",
        },
        "search:read.private": {
          label: "私有频道消息搜索",
          description: "使用 Slack Real-time Search 搜索私有频道的消息，需要 Slack 单独批准。",
        },
      },
    },
  },
};
