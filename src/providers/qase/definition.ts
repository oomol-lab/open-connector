import type { ProviderDefinition } from "../../core/types.ts";

import { qaseActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "qase",
  displayName: "Qase",
  description: "Manage Qase projects, test cases, and test runs.",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "QASE_API_TOKEN",
      description:
        "Qase API token sent in the Token header. See https://developers.qase.io/reference/introduction-to-the-qase-api.",
    },
  ],
  homepageUrl: "https://qase.io",
  actions: qaseActions,
};
