import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: readonly TriggerPermission[] = [
  {
    id: "one_drive.on_item_changed",
    name: "File or Folder Changed",
    description:
      "Reads Drive delta results and item metadata to detect changes in the selected drive or folder. Does not download or modify files.",
    providerPermissions: ["Files.Read"],
    instructions: "The connected account must have read access to the monitored drive and folder.",
  },
];
