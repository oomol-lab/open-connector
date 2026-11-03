import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  auth: {
    api_key: {
      label: "个人访问令牌",
      description:
        "通过 Authorization Bearer 请求头使用 Airtable 个人访问令牌。在开发者中心创建：https://airtable.com/create/tokens。",
    },
  },
};
