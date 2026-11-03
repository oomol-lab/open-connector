import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "腾讯会议 MCP",
  auth: {
    api_key: {
      label: "腾讯会议 Token",
      placeholder: "粘贴腾讯会议 MCP Token",
      description:
        "登录 https://meeting.tencent.com/ai-skill/ 并复制 Token。企业账号尚未获得访问权限时，可切换到个人账号。Token 代表你的账号身份；如有泄露，请在同一页面重置。",
    },
  },
};
