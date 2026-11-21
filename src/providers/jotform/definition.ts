import type { ProviderDefinition } from "../../core/types.ts";

import { jotformActions } from "./actions.ts";
import { snapshot } from "./trigger-on-submission.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "jotform";

/**
 * Jotform provider backed by the public Jotform REST API.
 */
export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Jotform",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "JOTFORM_API_KEY",
      description:
        "Jotform API key sent with the APIKEY request header. Create it from Account API > Create New Key: https://www.jotform.com/help/253-how-to-create-jotform-api-key/.",
    },
  ],
  homepageUrl: "https://www.jotform.com",
  actions: jotformActions,
};
