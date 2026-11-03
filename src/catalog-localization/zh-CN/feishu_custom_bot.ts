import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "飞书自定义机器人",
  auth: {
    api_key: {
      label: "Webhook 令牌",
      placeholder: "飞书 webhook 地址中的 token",
      description:
        "粘贴飞书 webhook 地址路径中的 token，也可以填写完整的 webhook 地址。创建自定义机器人的方法参见 https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot。",
      fields: {
        signingSecret: {
          label: "签名密钥",
          placeholder: "可选，飞书签名校验密钥",
          description: "可选，机器人启用签名校验时使用的签名密钥，可在飞书机器人的安全设置中复制。",
        },
      },
    },
  },
};
