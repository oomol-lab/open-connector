export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "slack.on_message_posted",
    name: "New Channel Message",
    description:
      "Reads conversation history to detect new messages in the selected channel. Does not send or modify messages.",
    providerScopeAlternatives: ["channels:history", "groups:history", "im:history", "mpim:history"],
    providerPermissions: [],
    instructions:
      "Requires the history scope for the selected conversation type: channels:history, groups:history, im:history or mpim:history. Private conversations also require membership.",
  },
];
