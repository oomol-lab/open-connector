export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "notion.on_database_page_event",
    name: "Database Page Added or Updated",
    description:
      "Reads database metadata and queries its data source to detect newly created or updated pages. Does not modify pages.",
    providerPermissions: ["read_content"],
    instructions: "Enable Read content and share the selected database with the integration.",
  },
];
