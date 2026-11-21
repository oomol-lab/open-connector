import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "trello.on_model_event",
    name: "Board or Card Event",
    description: "Manages a Trello webhook on the selected board, list, or card.",
    providerPermissions: ["read:board:trello", "read:member:trello"],
    instructions: "Use a Trello connection with read access to the target board, list, or card and member tokens.",
  },
];
