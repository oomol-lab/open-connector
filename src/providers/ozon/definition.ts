import type { ProviderDefinition } from "../../core/types.ts";

import { ozonActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "ozon",
  displayName: "Ozon",
  categories: ["Productivity", "Data"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "clientId",
          inputType: "text",
          label: "Client ID",
          required: true,
          secret: false,
          placeholder: "OZON_CLIENT_ID",
          description:
            "Ozon seller Client ID sent in the Client-Id header. Find it under Seller Settings > API keys: https://seller.ozon.ru/app/settings/api-keys.",
        },
        {
          key: "apiKey",
          inputType: "password",
          label: "API Key",
          required: true,
          secret: true,
          placeholder: "OZON_API_KEY",
          description:
            "Ozon Seller API key sent in the Api-Key header. Create it under Seller Settings > API keys: https://seller.ozon.ru/app/settings/api-keys.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.ozon.ru",
  actions: ozonActions,
};
