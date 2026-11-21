import type { ProviderDefinition } from "../../core/types.ts";

import { keapActions } from "./actions.ts";
import { snapshot } from "./trigger-on-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

export const provider: ProviderDefinition = {
  service: "keap",
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Keap",
  description: "Manage CRM contacts, opportunities, orders, and REST hooks in Keap.",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Key",
      placeholder: "KEAP_API_KEY",
      description: "Keap Personal Access Key sent via the X-Keap-API-Key header.",
    },
  ],
  homepageUrl: "https://keap.com",
  actions: keapActions,
};
