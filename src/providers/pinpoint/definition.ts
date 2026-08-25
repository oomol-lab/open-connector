import type { ProviderDefinition } from "../../core/types.ts";

import { pinpointActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "pinpoint",
  displayName: "Pinpoint",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "PINPOINT_API_KEY",
      description:
        "Pinpoint API key sent in the X-API-KEY header. Create or view keys in Settings > API & Webhooks > API Keys: https://developers.pinpointhq.com/docs/authentication.",
      extraFields: [
        {
          key: "subdomain",
          label: "Account Subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "acme",
          description: "The account-specific part before .pinpointhq.com in your Pinpoint login URL, such as acme.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.pinpointhq.com",
  actions: pinpointActions,
};
