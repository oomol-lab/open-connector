import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "slackbot.on_event",
    name: "Mention or Direct Message",
    description: "Manages a signed webhook and receives the selected business events.",
    providerPermissions: ["app_mentions:read", "im:history"],
    instructions: "Use a connection with access to the selected resources and permission to manage webhooks.",
  },
];
