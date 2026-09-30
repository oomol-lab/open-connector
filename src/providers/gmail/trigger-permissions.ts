export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "gmail.on_message_received",
    name: "New Message Received",
    description:
      "Reads mailbox history, labels and message headers to detect new messages matching the configured filters. Does not read attachments or change messages.",
    providerPermissions: ["https://www.googleapis.com/auth/gmail.readonly"],
    instructions: "Authorize read access to the mailbox.",
  },
];
