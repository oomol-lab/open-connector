import type { ProviderDefinition } from "../../core/types.ts";

import { pipedriveActions } from "./actions.ts";
import { snapshot } from "./trigger-on-crm-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "pipedrive";

export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Pipedrive",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "pipedrive_api_token",
      description:
        "Pipedrive API token used with the x-api-token header. Find it in Settings > Personal preferences > API: https://pipedrive.readme.io/docs/how-to-find-the-api-token",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.pipedrive.com",
  actions: pipedriveActions,
};
