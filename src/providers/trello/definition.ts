import type { ProviderDefinition } from "../../core/types.ts";

import { trelloActions } from "./actions.ts";

const service = "trello";

export const provider: ProviderDefinition = {
  service,
  displayName: "Trello",
  categories: ["Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "apiKey",
          label: "API Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Trello API key",
          description:
            "Trello API Key from the API Key tab at https://trello.com/apps/admin. Do not use the API Secret or an Atlassian API token here.",
        },
        {
          key: "apiToken",
          label: "API Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Trello API token",
          description:
            "Trello API token generated from the Token link beside your API Key at https://trello.com/apps/admin. This is different from the API Secret.",
        },
      ],
      testAction: {
        actionName: "get_member",
        input: {},
      },
    },
  ],
  homepageUrl: "https://trello.com",
  actions: trelloActions,
};
