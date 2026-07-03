import type { ProviderDefinition } from "../../core/types.ts";

import { bettercontactActions } from "./actions.ts";

const service = "bettercontact";

export const provider: ProviderDefinition = {
  service,
  displayName: "BetterContact",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "bc_...",
      description:
        "BetterContact API key used with the X-API-Key header. Find it in the BetterContact API Requests page: https://app.bettercontact.rocks/api_requests.",
      extraFields: [
        {
          key: "accountEmail",
          label: "Account Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "name@company.com",
          description:
            "Email address of your BetterContact account. Use the same email address you sign in with at https://app.bettercontact.rocks/.",
        },
      ],
    },
  ],
  homepageUrl: "https://bettercontact.rocks",
  actions: bettercontactActions,
};
