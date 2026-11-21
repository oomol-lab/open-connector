import type { ProviderDefinition } from "../../core/types.ts";

import { convertkitActions } from "./actions.ts";
import { snapshot } from "./trigger-on-subscriber-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

export const provider: ProviderDefinition = {
  service: "convertkit",
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Kit (ConvertKit)",
  description: "Manage email subscribers, forms, tags, and webhook automations in Kit (ConvertKit).",
  categories: ["Marketing", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "kit_api_key",
      description: "Kit v4 API key sent via the X-Kit-Api-Key header.",
    },
  ],
  homepageUrl: "https://kit.com",
  actions: convertkitActions,
};
