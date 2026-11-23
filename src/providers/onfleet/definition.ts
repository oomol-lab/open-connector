import type { ProviderDefinition } from "../../core/types.ts";

import { onfleetActions } from "./actions.ts";
import { snapshot } from "./trigger-on-task-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

export const provider: ProviderDefinition = {
  service: "onfleet",
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Onfleet",
  categories: ["Productivity", "Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ONFLEET_API_KEY",
      description:
        "Onfleet API key used as the Basic Auth username. Create or manage it in Configuration > API & Webhook: https://docs.onfleet.com/reference/scope-api-key.",
      extraFields: [
        {
          key: "webhookSecret",
          label: "Webhook Secret",
          inputType: "password",
          secret: true,
          required: false,
          description: "Optional hexadecimal webhook signing secret from Onfleet Configuration > API & Webhook.",
        },
      ],
    },
  ],
  homepageUrl: "https://onfleet.com/",
  actions: onfleetActions,
};
