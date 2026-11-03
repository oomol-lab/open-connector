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
        "channels:read": {
          label: "公开频道",
          description: "列出 Slack 公开频道并读取其元数据。",
        },
        "channels:history": {
          label: "公开频道消息",
          description: "读取公开 Slack 频道的历史消息。",
        },
        "groups:read": {
          label: "私有频道",
          description: "列出已连接用户有权访问的私有频道。",
        },
        "groups:history": {
          label: "私有频道消息",
          description: "读取私有 Slack 频道的历史消息。",
        },
        "users:read": {
          label: "用户目录",
          description: "读取 Slack 用户资料和目录信息。",
        },
        "im:read": {
          label: "私信会话",
          description: "读取私信会话的元数据。",
        },
        "im:history": {
          label: "私信历史消息",
          description: "读取私信的历史消息。",
        },
        "mpim:read": {
          label: "多人私信会话",
          description: "读取多人私信会话的元数据。",
        },
        "mpim:history": {
          label: "多人私信历史消息",
          description: "读取多人私信的历史消息。",
        },
        "files:read": {
          label: "文件",
          description: "读取 Slack 中共享的文件。",
        },
        "reactions:read": {
          label: "表情回应",
          description: "读取 Slack 消息上的表情回应。",
        },
        "chat:write": {
          label: "发送消息",
          description: "以已连接的 Slack 用户身份发送消息。",
        },
        "im:write": {
          label: "发送私信",
          description: "以已连接的 Slack 用户身份发送私信。",
        },
        "files:write": {
          label: "上传文件",
          description: "将文件上传到 Slack。",
        },
        "reactions:write": {
          label: "管理表情回应",
          description: "添加和移除 Slack 消息上的表情回应。",
        },
        "search:read": {
          label: "旧版消息搜索",
          description: "使用 Slack 旧版搜索 API 搜索消息。",
        },
        "search:read.public": {
          label: "公开频道消息搜索",
          description: "使用 Slack Real-time Search 搜索公开频道的消息。",
        },
        "search:read.private": {
          label: "私有频道消息搜索",
          description: "使用 Slack Real-time Search 搜索私有频道的消息。",
        },
      },
    },
  },
};
