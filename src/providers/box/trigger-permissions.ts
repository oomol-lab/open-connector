import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "box.on_item_event",
    name: "File or Folder Event",
    description: "Manages a Box webhook and receives the selected file or folder events.",
    providerPermissions: ["manage_webhook"],
    instructions: "Use a Box connection with permission to manage webhooks on the selected file or folder.",
  },
];
