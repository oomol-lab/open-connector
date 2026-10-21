import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "intercom.on_conversation_event",
    name: "Customer Conversation or Ticket",
    description: "Receives signed customer conversation and ticket notifications from a shared application source.",
    providerPermissions: ["Read conversations", "Read tickets"],
    instructions:
      "Configure the application webhook and Client Secret in Developer Hub, install it in the connected workspace, and send a signed ping before publishing. Administrator replies do not trigger flows.",
  },
];
