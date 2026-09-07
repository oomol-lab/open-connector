import type { ProviderDefinition } from "../../core/types.ts";

import { sfExpressActions } from "./actions.ts";

const service = "sf_express";

export const provider: ProviderDefinition = {
  service,
  displayName: "SF Express",
  categories: ["Productivity", "Location"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "partnerId",
          label: "Partner ID (顾客编码)",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "SF_EXPRESS_PARTNER_ID",
          description:
            "The partnerID (顾客编码) of your SF Express Open Platform application. Create an app and complete identity verification at https://open.sf-express.com.",
        },
        {
          key: "checkWord",
          label: "Check Word (校验码)",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "SF_EXPRESS_CHECK_WORD",
          description:
            "The checkWord (校验码) of the same SF Express Open Platform application, used to sign requests. New applications must pass the sandbox tests on https://open.sf-express.com before production calls succeed.",
        },
        {
          key: "sandbox",
          label: "Sandbox Mode (沙箱联调)",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "true",
          description:
            "Set to true to call the SF sandbox environment (sfapi-sbox.sf-express.com) instead of production. New applications must pass sandbox tests (3 successful calls within 7 days) before production access opens.",
        },
      ],
      testAction: {
        actionName: "validate_waybill_no",
        input: { waybill_no: "SF1040275268927" },
      },
    },
  ],
  homepageUrl: "https://open.sf-express.com",
  actions: sfExpressActions,
};
