export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "airtable.on_record_changed",
    name: "Record Created or Updated",
    description:
      "Reads records in the selected base and table to detect creations or updates. Does not modify records.",
    providerPermissions: ["data.records:read"],
    instructions:
      "Grant the token access to the selected base. The configured timestamp field must reflect the changes to monitor.",
  },
];
