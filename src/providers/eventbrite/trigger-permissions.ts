import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "eventbrite.on_event",
    name: "Eventbrite Webhook Event",
    description: "Manages an Eventbrite organization webhook for order, attendee, or event updates.",
    providerPermissions: [],
    instructions: "Use an Eventbrite private token with access to the target organization.",
  },
];
