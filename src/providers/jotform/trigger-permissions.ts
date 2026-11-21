import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "jotform.on_submission",
    name: "Form Submission",
    description: "Manages a Jotform webhook and receives new form submissions.",
    providerPermissions: [],
    instructions: "Use a Jotform API key with Full Access permission to manage form webhooks.",
  },
];
