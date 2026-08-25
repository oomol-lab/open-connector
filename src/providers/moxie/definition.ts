import type { ProviderDefinition } from "../../core/types.ts";

import { moxieActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "moxie",
  displayName: "Moxie",
  description: "Read clients, contacts, projects, pipeline stages, and task stages from a Moxie workspace.",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "MOXIE_API_KEY",
      description:
        "Enable Custom API on a Pro or Teams plan and copy the key from Apps & integrations: https://help.withmoxie.com/en/articles/16189299-use-custom-api-and-event-webhooks",
      extraFields: [
        {
          key: "baseUrl",
          label: "API Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://pod00.withmoxie.dev/api/public/",
          description: "The workspace-specific HTTPS API base URL displayed beside the Custom API key.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.withmoxie.com/",
  actions: moxieActions,
};
