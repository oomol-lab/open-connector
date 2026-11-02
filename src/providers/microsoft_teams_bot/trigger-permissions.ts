import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "microsoft_teams_bot.on_activity",
    name: "Bot Activity",
    description: "Receives activities that Microsoft Teams sends to the bot's messaging endpoint.",
    providerPermissions: [],
    instructions:
      "In the Azure Bot resource, set the Messaging endpoint under Configuration to the shared event source callback URL and enable the Microsoft Teams channel. Teams delivers every message in a personal chat with the bot, but in channels and group chats only messages that @mention the bot unless the app manifest requests the ChannelMessage.Read.Group or ChatMessage.Read.Chat resource-specific consent permission.",
  },
];
