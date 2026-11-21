import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "postmark.on_email_event",
    name: "Email Event",
    description: "Manages a Postmark webhook for delivery, bounce, open, click, or spam complaint events.",
    providerPermissions: [],
    instructions: "Use a Postmark Server API token with webhook management access.",
  },
];
