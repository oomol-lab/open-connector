import type { ProviderDefinition } from "../../core/types.ts";

import { tallyActions } from "./actions.ts";
import { snapshot } from "./trigger-on-form-response.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "tally";

export const provider: ProviderDefinition = {
  service,
  displayName: "Tally",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "tly_xxxx",
      description: "Tally API key used as a bearer token. Create it from Settings > API keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://tally.so",
  actions: tallyActions,
  triggers: [snapshot],
  triggerPermissions,
};
