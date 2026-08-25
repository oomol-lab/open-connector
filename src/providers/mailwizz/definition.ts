import type { ProviderDefinition } from "../../core/types.ts";

import { mailWizzActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "mailwizz",
  displayName: "MailWizz",
  description: "Manage MailWizz lists and subscribers.",
  categories: ["Marketing", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "MAILWIZZ_API_KEY",
      description: "MailWizz v2 API key sent in the X-Api-Key header.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://mail.example.com/api",
          description: "The base URL of the MailWizz v2 API.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.mailwizz.com",
  actions: mailWizzActions,
};
