import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "钉钉机器人",
  auth: {
    api_key: {
      label: "Webhook 访问令牌",
      placeholder: "钉钉 webhook 地址中的 access_token",
      description: "粘贴钉钉 webhook 地址中 access_token 查询参数的值，也可以填写完整的钉钉自定义机器人 webhook 地址。",
      fields: {
        signingSecret: {
          label: "签名密钥",
          placeholder: "可选，钉钉加签模式中的 SEC... 密钥",
          description: "可选，钉钉机器人启用加签安全模式时使用的签名密钥。",
        },
      },
    },
  },
};
