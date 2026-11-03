import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "通义千问",
  auth: {
    api_key: {
      label: "百炼 API 密钥",
      placeholder: "输入北京地域的百炼 API 密钥",
      description:
        "北京地域的阿里云百炼 API 密钥，通过 Bearer token 发送。在 https://bailian.console.aliyun.com/?apiKey=1#/api-key 创建密钥。",
    },
  },
};
