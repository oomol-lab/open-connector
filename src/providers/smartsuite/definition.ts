import type { ProviderDefinition } from "../../core/types.ts";

import { smartsuiteActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "smartsuite",
  displayName: "SmartSuite",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "SMARTSUITE_API_KEY",
      description: "SmartSuite API key sent in the Authorization header. Generate it from My Profile > API Key.",
      extraFields: [
        {
          key: "workspaceId",
          label: "Workspace ID",
          required: true,
          secret: false,
          inputType: "text",
          placeholder: "sv25cxf2",
          description: "The SmartSuite Workspace ID sent in the ACCOUNT-ID header.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.smartsuite.com/",
  actions: smartsuiteActions,
};
