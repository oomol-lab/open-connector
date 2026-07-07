import type { ProviderDefinition } from "../../core/types.ts";

import { brazeActions } from "./actions.ts";

const service = "braze";

export const provider: ProviderDefinition = {
  service,
  displayName: "Braze",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "REST API Key",
      placeholder: "BRAZE_REST_API_KEY",
      description:
        "Braze REST API key sent as Authorization: Bearer <key>. Create or view REST API keys in Braze under Settings > APIs and Identifiers > API Keys: https://www.braze.com/docs/api/basics.",
      extraFields: [
        {
          key: "restEndpoint",
          label: "REST Endpoint",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://rest.iad-01.braze.com",
          description:
            "Your Braze REST endpoint origin, copied from Settings > APIs and Identifiers > API Keys. Use the REST endpoint, not the SDK endpoint: https://www.braze.com/docs/api/basics#endpoints.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.braze.com",
  actions: brazeActions,
};
