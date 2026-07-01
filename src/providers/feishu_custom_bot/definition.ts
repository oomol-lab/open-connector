import type { ProviderDefinition } from "../../core/types.ts";

import { feishuCustomBotActions } from "./actions.ts";

const service = "feishu_custom_bot";

/**
 * Feishu Custom Bot provider backed by Feishu incoming webhook bots.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Feishu Custom Bot",
  categories: ["Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Webhook Token",
      placeholder: "token from Feishu webhook URL",
      description:
        "Paste the token path segment from the Feishu webhook URL. The full webhook URL is also accepted. Create a custom bot from https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot.",
      extraFields: [
        {
          key: "signingSecret",
          label: "Signing Secret",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Optional secret from Feishu signature verification",
          description:
            "Optional signing secret when signature verification is enabled for the bot. Copy it from the Feishu bot security settings.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.feishu.cn",
  actions: feishuCustomBotActions,
};
