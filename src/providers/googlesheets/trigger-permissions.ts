export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "googlesheets.on_row_added",
    name: "New Row Added",
    description:
      "Reads spreadsheet metadata and cell values to detect newly added rows in the selected sheet. Does not modify cells.",
    providerPermissions: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    instructions: "The connected account must have read access to the spreadsheet.",
  },
];
