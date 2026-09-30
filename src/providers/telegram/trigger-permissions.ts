export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "telegram.on_update",
    name: "Bot Update",
    description: "Inspects, sets and deletes the bot webhook to receive the configured Telegram update types.",
    providerPermissions: [],
    instructions:
      "Requires the bot token. Setting a webhook replaces its existing webhook; available group messages depend on bot privacy settings and chat permissions.",
  },
];
