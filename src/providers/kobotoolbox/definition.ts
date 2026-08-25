import type { ProviderDefinition } from "../../core/types.ts";

import { koboToolboxActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "kobotoolbox",
  displayName: "KoboToolbox",
  categories: ["Data", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "Your KoboToolbox API token",
      description:
        "KoboToolbox API token from account security settings: https://support.kobotoolbox.org/api.html#api-token.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Server URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://kf.kobotoolbox.org",
          description: "HTTPS root URL of your KoboToolbox server.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.kobotoolbox.org",
  actions: koboToolboxActions,
};
