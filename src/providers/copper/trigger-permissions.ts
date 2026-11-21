import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "copper.on_crm_event",
    name: "CRM Record Event",
    description: "Manages a Copper CRM webhook for record creation, update, or deletion.",
    providerPermissions: [],
    instructions: "Use a Copper API key and user email with webhook management permission.",
  },
];
