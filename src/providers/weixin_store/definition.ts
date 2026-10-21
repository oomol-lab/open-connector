import type { ProviderDefinition } from "../../core/types.ts";

import { weixinStoreActions } from "./actions.ts";

/**
 * WeChat Store (微信小店) provider backed by the WeChat Store Open Platform APIs.
 */
export const provider: ProviderDefinition = {
  service: "weixin_store",
  displayName: "WeChat Store",
  description:
    "Run a WeChat Store (微信小店) through the WeChat Store Open Platform APIs: upload product images, create and update products, list and delist them, manage stock, query and ship orders, look up freight templates and addresses, process after-sale requests, send talent cooperation invitations, manage existing promotion plans, inspect merchant alliance talents and product scene restrictions, and read historical Compass product metrics. If the store has an IP whitelist configured in the WeChat Store admin console (微信小店后台 → 服务市场 → 经营工具 → 自研 → IP 白名单), the runtime's public egress IP must be added to it, otherwise every call fails with HTTP 403.",
  categories: ["E-commerce"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      description:
        "The AppID and AppSecret of the WeChat Store (微信小店), found in the WeChat Store admin console (微信小店后台 → 服务市场 → 经营工具 → 自研). If the store has an IP whitelist configured there (自研 → IP 白名单), add this runtime's public egress IP to it first, otherwise every API call fails with HTTP 403.",
      fields: [
        {
          key: "appId",
          label: "AppID",
          inputType: "text",
          required: true,
          secret: false,
          description:
            "The AppID of the WeChat Store. Find it in the WeChat Store admin console (微信小店后台) under 服务市场 → 经营工具 → 自研.",
        },
        {
          key: "appSecret",
          label: "AppSecret",
          inputType: "password",
          required: true,
          secret: true,
          description:
            "The AppSecret of the same WeChat Store, shown next to the AppID under 服务市场 → 经营工具 → 自研. If the store has an IP whitelist configured (自研 → IP 白名单), this runtime's public egress IP must be added to it first.",
        },
      ],
    },
  ],
  homepageUrl: "https://channels.weixin.qq.com/shop",
  actions: weixinStoreActions,
};
