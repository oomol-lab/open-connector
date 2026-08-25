import type { ProviderDefinition } from "../../core/types.ts";

import { invoiceNinjaActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "invoice_ninja",
  displayName: "Invoice Ninja",
  categories: ["Finance", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      extraFields: [
        {
          key: "instanceUrl",
          label: "Instance URL",
          required: true,
          inputType: "text",
          secret: false,
          placeholder: "https://invoicing.co",
        },
      ],
    },
  ],
  homepageUrl: "https://invoiceninja.com",
  actions: invoiceNinjaActions,
};
