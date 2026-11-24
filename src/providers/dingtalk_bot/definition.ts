import type { ProviderDefinition } from "../../core/types.ts";

import { dingtalkBotActions } from "./actions.ts";

const service = "dingtalk_bot";

export const provider: ProviderDefinition = {
  service,
  displayName: "DingTalk Bot",
  description:
    "DingTalk group robot webhook: only sends text, markdown, link and card messages into its webhook's group. For docs, calendar or contacts, use DingTalk MCP.",
  categories: ["Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Webhook Access Token",
      placeholder: "access_token from DingTalk webhook URL",
      description:
        "Paste the access_token query value from the DingTalk webhook URL. The full DingTalk custom bot webhook URL is also accepted.",
      extraFields: [
        {
          key: "signingSecret",
          label: "Signing Secret",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Optional SEC... secret from DingTalk signature mode",
          description: "Optional signing secret used when the DingTalk bot enables signature security mode.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.dingtalk.com",
  actions: dingtalkBotActions,
};
