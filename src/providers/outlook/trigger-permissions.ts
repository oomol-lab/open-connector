export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "outlook.on_message_received",
    name: "New Message Received",
    description:
      "Reads mail folder delta results and message data to detect newly received messages matching the selected filters.",
    providerScopeAlternatives: ["Mail.Read", "Mail.ReadWrite"],
    providerPermissions: ["Mail.Read"],
    instructions:
      "Requires Mail.Read or a permission that includes it. Does not modify messages or download attachments.",
  },
];
