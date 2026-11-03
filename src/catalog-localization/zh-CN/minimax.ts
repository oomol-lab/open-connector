import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  auth: {
    api_key: {
      label: "API 密钥",
      description:
        "通过 Authorization Bearer 请求头使用 MiniMax API 密钥。全球版密钥可在 https://platform.minimax.io/user-center/basic-information/interface-key 创建或查看，中国版密钥可在 https://platform.minimaxi.com/user-center/basic-information/interface-key 创建或查看。",
      fields: {
        region: {
          label: "地域",
          description:
            "可选，此密钥对应的 MiniMax API 地域。填写 global 使用 api.minimax.io，填写 china 使用 api.minimaxi.com。",
        },
      },
    },
  },
};
