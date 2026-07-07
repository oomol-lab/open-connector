import type { ProviderDefinition } from "../../core/types.ts";

import { nocrmIoActions } from "./actions.ts";

const service = "nocrm_io";

export const provider: ProviderDefinition = {
  service,
  displayName: "noCRM.io",
  categories: ["Marketing", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "nocrm_api_key",
      description: "noCRM.io API key sent with the X-API-KEY header.",
      extraFields: [
        {
          key: "subdomain",
          label: "Subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "your-workspace",
          description: "The noCRM.io account subdomain used to build https://<subdomain>.nocrm.io API requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.nocrm.io",
  actions: nocrmIoActions,
};
