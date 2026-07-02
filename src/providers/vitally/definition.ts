import type { ProviderDefinition } from "../../core/types.ts";

import { vitallyActions } from "./actions.ts";

const service = "vitally";

export const provider: ProviderDefinition = {
  service,
  displayName: "Vitally",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "vitally_api_key",
      description:
        "Vitally REST API key used as the Basic Auth username. Create and copy keys in Vitally under Settings > Operations > Integrations > Vitally REST API: https://docs.vitally.io/en/articles/9880649-rest-api-overview.",
      extraFields: [
        {
          key: "region",
          label: "Region",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "us",
          description:
            "Vitally REST API region. Use us for https://<subdomain>.rest.vitally.io or eu for https://rest.vitally-eu.io.",
        },
        {
          key: "subdomain",
          label: "Subdomain",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "your-company",
          description:
            "US REST API subdomain used to build https://<subdomain>.rest.vitally.io. Required for US accounts and ignored for EU accounts.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.vitally.io/",
  actions: vitallyActions,
};
