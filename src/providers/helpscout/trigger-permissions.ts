import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "helpscout.on_conversation_event",
    name: "Conversation Event",
    description: "Manages a signed Help Scout webhook and receives conversation or customer events.",
    providerPermissions: [],
    instructions: "Use a Help Scout OAuth connection with permission to manage webhooks.",
  },
];
