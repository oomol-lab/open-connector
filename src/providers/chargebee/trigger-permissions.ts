import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "chargebee.on_event",
    name: "Billing Event",
    description: "Polls Chargebee billing and subscription events.",
    providerPermissions: [],
    instructions: "Use a Chargebee API key with read access to Events.",
  },
];
