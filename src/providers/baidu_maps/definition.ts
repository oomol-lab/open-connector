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
            "Computed automatically by the runtime for endpoints that require SN validation (such as /place/v2/*, /directionlite/v1/*, /weather/v1, /location/ip, /api_region/v1, /api_distance/v2). Leave blank when SN validation is disabled for your application.",
        },
      ],
    },
  ],
  homepageUrl: "https://lbsyun.baidu.com",
  actions: baiduMapsActions,
};
