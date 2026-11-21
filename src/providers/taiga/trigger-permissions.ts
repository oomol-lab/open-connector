import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "taiga.on_project_event",
    name: "Project Event",
    description: "Manages a signed Taiga project webhook and receives selected entity events.",
    providerPermissions: [],
    instructions: "Use a Taiga account with administrator access on the target project.",
  },
];
