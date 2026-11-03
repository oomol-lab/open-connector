import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  displayName: "高德地图",
  auth: {
    api_key: {
      label: "API 密钥",
      description:
        "高德地图 API 密钥，通过 key 查询参数发送。在高德开放平台控制台创建密钥，参见 https://lbs.amap.com/api/webservice/guide/create-project/get-key。",
    },
  },
};
