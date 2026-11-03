import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "百度千帆",
  auth: {
    api_key: {
      label: "API 密钥",
      description:
        "通过 Authorization Bearer 请求头使用百度千帆 API 密钥。在系统管理 > API Key 中创建密钥，参见 https://cloud.baidu.com/doc/qianfan/s/wmh8l6tnf。",
    },
  },
};
