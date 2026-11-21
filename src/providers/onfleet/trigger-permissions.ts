import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "onfleet.on_task_event",
    name: "Task or Worker Event",
    description: "Manages an Onfleet webhook and receives delivery task or worker events.",
    providerPermissions: [],
    instructions: "Use an Onfleet API key with permission to manage webhooks.",
  },
];
