import type { ProviderDefinition } from "../../core/types.ts";

import { baiduMapsActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "baidu_maps",
  displayName: "Baidu Maps",
  categories: ["Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "AK (Access Key)",
      placeholder: "Baidu Maps AK",
      description:
        "Baidu Maps AK passed via the ak query parameter. Create or manage keys in the official console: https://lbsyun.baidu.com/apiconsole/key. Provide an SK in the optional field when your application requires SN validation.",
      extraFields: [
        {
          key: "sk",
          label: "SK (Secret Key)",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Only required for SN-signed endpoints",
          description:
            "The SK is used only to compute the SN signature locally; it is never sent to Baidu. Baidu's SN check is an AK-level setting (chosen in the console as the AK's request-verification method), so when an SK is provided every request is signed automatically. Leave blank when your AK uses IP-whitelist verification instead of SN.",
        },
      ],
    },
  ],
  homepageUrl: "https://lbsyun.baidu.com",
  actions: baiduMapsActions,
};
