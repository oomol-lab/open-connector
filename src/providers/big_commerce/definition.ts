import type { ProviderDefinition } from "../../core/types.ts";

import { bigCommerceActions } from "./actions.ts";

const service = "big_commerce";

export const provider: ProviderDefinition = {
  service,
  displayName: "BigCommerce",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "BIGCOMMERCE_ACCESS_TOKEN",
      description:
        "BigCommerce Store API account access token used with the X-Auth-Token header. Create or view Store API accounts in Settings > Store-level API accounts: https://support.bigcommerce.com/s/article/Store-API-Accounts",
      extraFields: [
        {
          key: "storeHash",
          label: "Store Hash",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "abc123",
          description:
            "Your BigCommerce store hash used in the Management API base URL https://api.bigcommerce.com/stores/{store_hash}/v3. Find it in your store API path or Store API account details.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.bigcommerce.com",
  actions: bigCommerceActions,
};
