import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "keap.on_event",
    name: "CRM Event",
    description: "Manages a Keap REST hook subscription and receives CRM events.",
    providerPermissions: [],
    instructions: "Use a Keap API key with REST hook management permissions.",
  },
];
