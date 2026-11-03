import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "飞书应用机器人",
  auth: {
    custom_credential: {
      fields: {
        appId: {
          label: "应用 ID",
          description:
            "用于获取 tenant_access_token 的飞书自建应用 app_id，可在 https://open.feishu.cn/app 的应用凭证页面查看。",
        },
        appSecret: {
          label: "应用密钥",
          description:
            "用于获取 tenant_access_token 的飞书自建应用 app_secret，可在 https://open.feishu.cn/app 的应用凭证页面复制。",
        },
        verificationToken: {
          label: "事件验证令牌",
          description: "可选的飞书事件订阅验证令牌。仅在此连接通过 OpenConnector 验证入站频道事件时需要。",
        },
        encryptKey: {
          label: "事件加密密钥",
          description:
            "可选的飞书事件订阅 Encrypt Key。OpenConnector 验证加密入站事件时，需与 verificationToken 一同配置。",
        },
      },
    },
  },
};
