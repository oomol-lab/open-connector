import type { ProviderDefinition } from "../../core/types.ts";

import { wecomBotActions } from "./actions.ts";

const service = "wecom_bot";

export const provider: ProviderDefinition = {
  service,
  displayName: "WeCom Bot",
  categories: ["Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Webhook Key",
      placeholder: "693a91f6-7xxx-4bc4-97a0-0ec2sifa5aaa",
      description:
        "Paste the `key` query value from the WeCom bot webhook URL. Create the group bot and copy its webhook URL from the official config guide: https://developer.work.weixin.qq.com/document/path/91770 . The full webhook URL is also accepted.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://work.weixin.qq.com",
  actions: wecomBotActions,
};
