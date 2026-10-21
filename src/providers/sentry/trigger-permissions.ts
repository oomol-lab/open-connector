import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "sentry.on_issue_alert",
    name: "Issue Alert",
    description: "Receives Issue Alert Rule notifications from an installed Custom Integration.",
    providerPermissions: ["org:read"],
    instructions:
      "Install a Custom Integration in the connected organization, enable its alert action, configure the callback and Client Secret, and send a test Issue Alert before publishing.",
  },
];
