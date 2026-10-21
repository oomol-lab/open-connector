import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "clickup.on_task_event",
    name: "Task Event",
    description: "Manages a signed webhook and receives the selected business events.",
    providerPermissions: [],
    instructions: "Use a connection with access to the selected resources and permission to manage webhooks.",
  },
];
