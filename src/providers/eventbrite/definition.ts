import type { ProviderDefinition } from "../../core/types.ts";

import { eventbriteActions } from "./actions.ts";
import { snapshot } from "./trigger-on-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

export const provider: ProviderDefinition = {
  service: "eventbrite",
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Eventbrite",
  description: "Manage Eventbrite organizations, events, orders, and webhooks.",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Private Token",
      placeholder: "EVENTBRITE_PRIVATE_TOKEN",
      description: "Eventbrite private OAuth token sent as a Bearer token.",
    },
  ],
  homepageUrl: "https://www.eventbrite.com",
  actions: eventbriteActions,
};
