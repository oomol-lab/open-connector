import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "mailchimp.on_audience_event",
    name: "Audience Event",
    description: "Manages a Mailchimp audience webhook and receives subscriber or campaign events.",
    providerPermissions: [],
    instructions: "Use a Mailchimp connection with permission to manage webhooks on the target audience.",
  },
];
