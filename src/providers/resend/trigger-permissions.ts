import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "resend.on_email_event",
    name: "Email Received, Bounced or Complained",
    description: "Manages a signed webhook and receives the selected business events.",
    providerPermissions: [],
    instructions: "Use a Full access API key. Receiving email also requires a configured receiving domain.",
  },
];
