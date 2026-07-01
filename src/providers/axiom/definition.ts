import type { ProviderDefinition } from "../../core/types.ts";

import { axiomActions } from "./actions.ts";

const service = "axiom";

export const provider: ProviderDefinition = {
  service,
  displayName: "Axiom",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "axiom_api_token",
      description:
        "Axiom API token used with the Authorization Bearer header. Create or view API tokens from Settings > API tokens in Axiom: https://app.axiom.co/",
      extraFields: [],
    },
  ],
  homepageUrl: "https://axiom.co",
  actions: axiomActions,
};
