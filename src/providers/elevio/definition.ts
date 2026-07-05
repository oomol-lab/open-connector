import type { ProviderDefinition } from "../../core/types.ts";

import { elevioActions } from "./actions.ts";

const service = "elevio";

export const provider: ProviderDefinition = {
  service,
  displayName: "Elevio",
  categories: ["Productivity", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ELEVIO_API_KEY",
      description:
        "Elevio REST API key sent in the x-api-key header. Create or view API keys from the Elevio dashboard API Keys page: https://app.elev.io/apikeys.",
      extraFields: [
        {
          key: "jwt",
          label: "JSON Web Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "ELEVIO_JWT",
          description:
            "Elevio REST API JWT sent as the Bearer token. Generate it with the matching API key from the Elevio dashboard API Keys page: https://app.elev.io/apikeys.",
        },
      ],
    },
  ],
  homepageUrl: "https://elev.io",
  actions: elevioActions,
};
