import type { ProviderDefinition } from "../../core/types.ts";

import { genpageActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "genpage",
  displayName: "GenPage",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "GenPage API token",
      description:
        "Workspace-scoped GenPage API token sent as Bearer authentication. Create one under Settings > Integrations: https://app.genpage.ai",
    },
  ],
  homepageUrl: "https://www.genpage.ai/",
  actions: genpageActions,
};
