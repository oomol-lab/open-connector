import type { ProviderDefinition } from "../../core/types.ts";

import { mailgunActions } from "./actions.ts";

const service = "mailgun";

export const provider: ProviderDefinition = {
  service,
  displayName: "Mailgun",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Private API Key",
      placeholder: "key-...",
      description:
        "Mailgun private API key used with HTTP Basic auth as api:YOUR_API_KEY. Create or view API keys in Mailgun security settings: https://app.mailgun.com/settings/api_security.",
      extraFields: [
        {
          key: "apiBaseUrl",
          label: "API Base URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://api.mailgun.net",
          description:
            "Optional official Mailgun API base URL. Use https://api.eu.mailgun.net for EU accounts; otherwise leave the default https://api.mailgun.net URL.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.mailgun.com",
  actions: mailgunActions,
};
