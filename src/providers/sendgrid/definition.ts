import type { ProviderDefinition } from "../../core/types.ts";

import { sendgridActions } from "./actions.ts";

const service = "sendgrid";

export const provider: ProviderDefinition = {
  service,
  displayName: "SendGrid",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "SG....",
      description:
        "SendGrid API key used with the Authorization Bearer header. Create it in Settings > API Keys: https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys/.",
      extraFields: [
        {
          key: "baseUrl",
          label: "API Base URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://api.sendgrid.com",
          description: "Optional override for EU regional subusers, for example https://api.eu.sendgrid.com.",
        },
      ],
    },
  ],
  homepageUrl: "https://sendgrid.com",
  actions: sendgridActions,
};
