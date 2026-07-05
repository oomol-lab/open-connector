import type { ProviderDefinition } from "../../core/types.ts";

import { freshsalesActions } from "./actions.ts";

const service = "freshsales";

export const provider: ProviderDefinition = {
  service,
  displayName: "Freshsales",
  categories: ["Marketing", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "freshsales_api_key",
      description:
        "Freshworks CRM API key sent in the Authorization header. Find it from Profile Settings > API Settings as documented by Freshworks: https://crmsupport.freshworks.com/support/solutions/articles/50000002503-how-to-find-my-api-key-.",
      extraFields: [
        {
          key: "bundleAlias",
          label: "Bundle Alias",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "your-company",
          description:
            "Freshworks CRM bundle alias used to build https://<bundleAlias>.myfreshworks.com/crm/sales API requests. It appears below your API key in Profile Settings > API Settings.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.freshworks.com/crm/sales/",
  actions: freshsalesActions,
};
