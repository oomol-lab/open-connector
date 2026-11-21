import type { ProviderDefinition } from "../../core/types.ts";

import { copperActions } from "./actions.ts";
import { snapshot } from "./trigger-on-crm-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

export const provider: ProviderDefinition = {
  service: "copper",
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Copper",
  description: "Manage CRM contacts, opportunities, and webhooks in Copper.",
  categories: ["Productivity", "Marketing"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "userEmail",
          label: "User Email",
          inputType: "email",
          required: true,
          secret: false,
          placeholder: "user@example.com",
        },
        {
          key: "apiKey",
          label: "API Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "COPPER_API_KEY",
        },
      ],
    },
  ],
  homepageUrl: "https://www.copper.com",
  actions: copperActions,
};
