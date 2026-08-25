import type { ProviderDefinition } from "../../core/types.ts";

import { practitestActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "practitest",
  displayName: "PractiTest",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "YOUR_PRACTITEST_API_TOKEN",
      description:
        "PractiTest personal or account API token sent in the PTToken header. Create or view tokens in Account Settings or Personal Settings: https://www.practitest.com/help/automation-integration/api/",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.practitest.com/",
  actions: practitestActions,
};
