import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "wise.on_event",
    name: "Transfer or Balance Event",
    description: "Manages a Wise profile webhook subscription for transfer or balance events.",
    providerPermissions: [],
    instructions: "Use a Wise API token with permission to manage webhook subscriptions on the selected profile.",
  },
];
