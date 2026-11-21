import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "convertkit.on_subscriber_event",
    name: "Subscriber Event",
    description: "Manages a Kit (ConvertKit) webhook for subscriber events.",
    providerPermissions: [],
    instructions: "Use a Kit v4 API key with webhook management access.",
  },
];
