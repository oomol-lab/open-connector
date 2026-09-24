import type { ProviderDefinition } from "../../core/types.ts";

import { proworkflowActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "proworkflow",
  displayName: "ProWorkflow",
  description: "List, inspect, and update ProWorkflow projects and project items.",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "xxxx-xxxx-xxxx-xxxx-PWFxxxx",
      description:
        "Create or view the API key under Settings > Integrations > API Keys. See https://help.proworkflow.com/en/articles/1817949-how-to-find-your-api-key.",
    },
  ],
  homepageUrl: "https://www.proworkflow.com/",
  actions: proworkflowActions,
};
