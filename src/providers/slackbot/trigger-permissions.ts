import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "slackbot.on_event",
    name: "Mention or Direct Message",
    description: "Receives app mentions and direct messages from a shared Slack application event source.",
    providerPermissions: ["app_mentions:read", "im:history"],
    instructions:
      "Enable Event Subscriptions in the Slack application, configure the shared event source callback URL and Signing Secret, and subscribe to app_mention and message.im with app_mentions:read and im:history permissions.",
  },
];
