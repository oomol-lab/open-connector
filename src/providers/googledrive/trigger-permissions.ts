export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "googledrive.changes_detected",
    name: "Changes Detected",
    description:
      "Creates and renews Drive change notification channels, reads the change stream and stops channels during cleanup.",
    providerPermissions: ["https://www.googleapis.com/auth/drive.readonly"],
    instructions: "Requires read access to the selected Drive resources. Does not download file contents.",
  },
  {
    id: "googledrive.watch_changes",
    name: "Watch Changes",
    description:
      "Manages Drive change notification channels and periodically scans the same change stream to emit file changes.",
    providerPermissions: ["https://www.googleapis.com/auth/drive.readonly"],
    instructions:
      "Requires read access to the selected Drive resources. Channels are stopped during cleanup; file contents are not downloaded.",
  },
  {
    id: "googledrive.on_file_change",
    name: "File or Folder Change in a Folder",
    description:
      "Reads file and folder metadata in the selected folder to detect changes. Does not download or modify files.",
    providerPermissions: ["https://www.googleapis.com/auth/drive.readonly"],
    instructions: "The connected account must be able to read the selected folder and its monitored items.",
  },
];
