import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "paypal.on_event",
    name: "PayPal Event",
    description: "Manages a PayPal webhook and receives selected payment or billing events.",
    providerPermissions: [],
    instructions: "Use a PayPal REST app connection with Webhooks management enabled.",
  },
];
