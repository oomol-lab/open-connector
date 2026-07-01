import type { ProviderDefinition } from "../../core/types.ts";

import { feishuAppBotActions } from "./actions.ts";

const service = "feishu_app_bot";

/**
 * Feishu App Bot provider backed by the Feishu Open Platform bot APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Feishu App Bot",
  categories: ["Communication"],
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
          description:
            "The Feishu custom app app_id used to fetch tenant_access_token. Find it in the app credentials page at https://open.feishu.cn/app.",
        },
        {
          key: "appSecret",
          label: "App Secret",
          inputType: "password",
          required: true,
          secret: true,
          description:
            "The Feishu custom app app_secret used to fetch tenant_access_token. Copy it from the app credentials page at https://open.feishu.cn/app.",
        },
      ],
    },
  ],
  homepageUrl: "https://open.feishu.cn",
  actions: feishuAppBotActions,
};
