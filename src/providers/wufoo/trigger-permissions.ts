import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "wufoo.on_form_entry",
    name: "Form Entry",
    description: "Manages a Wufoo form webhook and receives new form entries.",
    providerPermissions: [],
    instructions: "Use a Wufoo API key with permission to manage webhooks on the target form.",
  },
];
