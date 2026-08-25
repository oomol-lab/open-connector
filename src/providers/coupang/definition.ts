import type { ProviderDefinition } from "../../core/types.ts";

import { coupangActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "coupang",
  displayName: "Coupang",
  categories: ["Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "vendorId",
          inputType: "text",
          label: "Vendor ID",
          required: true,
          secret: false,
          placeholder: "A00012345",
          description:
            "The supplier code shown with the Open API key in Coupang WING: https://developers.coupang.com/en/faq/where-can-i-issue-check-api-keyaccesskey-secretkey",
        },
        {
          key: "accessKey",
          inputType: "password",
          label: "Access Key",
          required: true,
          secret: true,
          placeholder: "Coupang Access Key",
          description: "The Access Key issued by Coupang WING for Open API signing.",
        },
        {
          key: "secretKey",
          inputType: "password",
          label: "Secret Key",
          required: true,
          secret: true,
          placeholder: "Coupang Secret Key",
          description: "The Secret Key paired with the Access Key for HMAC-SHA256 signing.",
        },
        {
          key: "market",
          inputType: "text",
          label: "Market",
          required: false,
          secret: false,
          placeholder: "KR",
          description: "The buyer market code: KR or TW. Defaults to KR.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.coupang.com",
  actions: coupangActions,
};
