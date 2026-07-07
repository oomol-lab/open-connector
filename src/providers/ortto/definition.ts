import type { ProviderDefinition } from "../../core/types.ts";

import { orttoActions } from "./actions.ts";

const service = "ortto";

export const provider: ProviderDefinition = {
  service,
  displayName: "Ortto",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Custom API Key",
      placeholder: "ORTTO_API_KEY",
      description:
        "Ortto custom API key sent with the X-Api-Key header. Create a custom API data source in Ortto to get the key: https://help.ortto.com/user/latest/data-sources/configuring-a-new-data-source/other-integrations/custom-api.html.",
      extraFields: [
        {
          key: "region",
          label: "Region",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "default",
          description:
            "Optional Ortto instance region. Use default for api.ap3api.com, au for api.au.ap3api.com, or eu for api.eu.ap3api.com.",
        },
      ],
    },
  ],
  homepageUrl: "https://ortto.com",
  actions: orttoActions,
};
