import type { ProviderDefinition } from "../../core/types.ts";

import { metabaseActions } from "./actions.ts";
import { metabaseMcpActions } from "./mcp-actions.ts";

const service = "metabase";

export const provider: ProviderDefinition = {
  service,
  displayName: "Metabase",
  categories: ["Data", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "mb_api_key_...",
      description:
        "Metabase API key sent with the X-API-Key header. Create an API key from Admin settings > Authentication > API keys in Metabase.",
      extraFields: [
        {
          key: "instanceUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://metabase.example.com",
          description: "Your public HTTPS Metabase instance URL. URLs ending in /api are also accepted.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.metabase.com",
  actions: [...metabaseActions, ...metabaseMcpActions],
};
