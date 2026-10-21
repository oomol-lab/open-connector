import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: readonly TriggerPermission[] = [
  {
    id: "tally.on_form_response",
    name: "Form Response",
    description: "Lists forms and manages a signed webhook to receive new form submissions.",
    providerPermissions: [],
    instructions: "Use a Tally API key with access to the selected form and permission to manage its webhooks.",
  },
];
