import type { ProviderDefinition } from "../../core/types.ts";

import { mcdonaldsCnActions } from "./actions.ts";

const service = "mcdonalds_cn";

/**
 * McDonald's China provider backed by the McDonald's China Open Platform APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "McDonald's China",
  categories: ["Location", "Data"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "appId",
          label: "App ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "McDonald's China AppId",
          description: "McDonald's China merchant application ID from the Open Platform.",
        },
        {
          key: "merchantId",
          label: "Merchant ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "McDonald's China MerchantId",
          description: "McDonald's China merchant ID from the Open Platform.",
        },
        {
          key: "signingKey",
          label: "Signing Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "McDonald's China signing key",
          description:
            "Signing key paired with the AppId and MerchantId. It is used to generate the Sign header required by the Open Platform.",
        },
        {
          key: "environment",
          label: "Environment",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "prod or uat",
          description:
            "McDonald's China API environment. Use prod for https://api.open.mcd.cn or uat for https://api-uat.open.mcdchina.net. Defaults to prod.",
        },
      ],
    },
  ],
  homepageUrl: "https://open.mcd.cn",
  actions: mcdonaldsCnActions,
};
