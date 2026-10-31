import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "slackbot.on_event",
    name: "Mention, Direct Message or Interaction",
    description:
      "Receives app mentions, direct messages and interactive component payloads from a shared Slack application event source.",
    providerPermissions: ["app_mentions:read", "im:history"],
    instructions:
      "Enable Event Subscriptions in the Slack application, configure the shared event source callback URL and Signing Secret, and subscribe to app_mention and message.im with app_mentions:read and im:history permissions. To receive block_actions, view_submission or view_closed, also enable Interactivity and set its Request URL to the same callback URL.",
  },
];
