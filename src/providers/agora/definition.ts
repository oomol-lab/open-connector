import type { ProviderDefinition } from "../../core/types.ts";

import { agoraActions } from "./actions.ts";

const service = "agora";

export const provider: ProviderDefinition = {
  service,
  displayName: "Agora",
  categories: ["Communication", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Customer Secret",
      placeholder: "AGORA_CUSTOMER_SECRET",
      description:
        "Agora Customer Secret used as the Basic Auth password. View Customer ID and Customer Secret in the Agora Console RESTful API settings: https://console.agora.io/v2.",
      extraFields: [
        {
          key: "customerId",
          label: "Customer ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "AGORA_CUSTOMER_ID",
          description:
            "Agora Customer ID used as the Basic Auth username. View it with the Customer Secret in the Agora Console RESTful API settings: https://console.agora.io/v2.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.agora.io",
  actions: agoraActions,
};
