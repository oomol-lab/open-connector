import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  auth: {
    api_key: {
      label: "API 密钥",
      description:
        "通过 Authorization Bearer 请求头使用 OpenAI API 密钥。在 API Keys 页面创建或管理密钥：https://platform.openai.com/api-keys。",
    },
  },
};
