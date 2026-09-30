export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "linear.on_issue_changed",
    name: "Issue Created or Updated",
    description:
      "Queries issues and configuration options to detect newly created or updated issues matching the selected filters.",
    providerPermissions: ["read"],
    instructions:
      "Grant read access to the selected workspace and teams. API key access is limited by the key owner and selected teams.",
  },
];
