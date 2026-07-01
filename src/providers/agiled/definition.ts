import type { ProviderDefinition } from "../../core/types.ts";

import { agiledActions } from "./actions.ts";

const service = "agiled";

export const provider: ProviderDefinition = {
  service,
  displayName: "Agiled",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "AGILED_API_TOKEN",
      description:
        "Agiled API token sent as the api_token query parameter. Create or view it in Settings > API Settings in your Agiled account: https://my.agiled.app/developers.",
      extraFields: [
        {
          key: "brand",
          label: "Account URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://your-company.agiled.app",
          description:
            "Your Agiled account URL sent in the Brand header. Copy it from the browser address bar after signing in to your Agiled workspace.",
        },
      ],
    },
  ],
  homepageUrl: "https://agiled.app",
  actions: agiledActions,
};
