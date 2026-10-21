import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "typeform.on_form_response",
    name: "Completed Form Response",
    description: "Receives complete submissions using a signed form webhook.",
    providerPermissions: ["webhooks:read", "webhooks:write"],
    instructions:
      "Authorize webhook read and write access for the selected form. Existing OAuth connections may require reauthorization.",
  },
];
