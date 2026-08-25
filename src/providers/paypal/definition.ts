import type { ProviderDefinition } from "../../core/types.ts";

import { paypalActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "paypal",
  displayName: "PayPal",
  categories: ["Finance"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        { key: "clientId", label: "Client ID", required: true, inputType: "text", secret: false },
        { key: "clientSecret", label: "Client Secret", required: true, inputType: "password", secret: true },
        {
          key: "environment",
          label: "Environment",
          required: true,
          inputType: "text",
          secret: false,
          placeholder: "sandbox",
        },
      ],
    },
  ],
  homepageUrl: "https://www.paypal.com/",
  actions: paypalActions,
};
