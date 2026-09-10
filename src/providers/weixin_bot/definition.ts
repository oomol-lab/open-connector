import type { ProviderDefinition } from "../../core/types.ts";

import { weixinBotActions } from "./actions.ts";

export const nodeOnly = true;

export const provider: ProviderDefinition = {
  service: "weixin_bot",
  displayName: "Weixin Bot",
  description:
    "Receive and reply to Weixin messages through Tencent's iLink Bot API. Media encryption requires the Node.js runtime.",
  categories: ["Communication"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "botToken",
          label: "Bot Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Paste the botToken from the QR login example",
          description:
            "The secret bot token returned after QR pairing. Run `node examples/weixin-bot-login.ts` locally to obtain it, and do not share it.",
        },
        {
          key: "accountId",
          label: "Bot Account ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "Paste the accountId from the QR login example",
          description: "The ilink_bot_id returned together with the bot token after QR pairing.",
        },
      ],
    },
  ],
  homepageUrl: "https://github.com/Tencent/openclaw-weixin",
  actions: weixinBotActions,
};
